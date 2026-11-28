/*
 * Text that remembers where the privacy filter replaced something. The filter (`redact.ts`) runs
 * its patterns pass by pass over the whole text, exactly as `String.replaceAll` would; a
 * `Tracker` applies the same matches and keeps, for every placeholder it writes, the source text
 * that stood there. The consent card highlights those places and shows the original on the
 * device only, so the panel never has to search the data for "[name]" (an email can contain that
 * text itself).
 *
 * A text is a list of segments: verbatim slices of the source, and replacements. A later match
 * wholly inside a replacement (an IBAN in a link's host) becomes a child span of it; a match
 * covering several segments becomes one replacement whose original is the covered source; a match
 * that cuts into a replacement (a bare link read up to the "[link:" of an earlier one; found by the
 * monkey test) leaves the cut piece without a span of its own. All matches of a pass are applied
 * from right to left, so earlier offsets stay valid.
 */
import type { RedactedKind, RedactedSpan } from './redact';

/**
 * A replacement for one match: the text to write, its kind, and spans inside that text.
 * `slotFor` says where a character at `offsetInMatch` ended up in `text`, for the parts of the
 * match the replacement kept (a link's host, an address's domain), so a name stand-in there keeps
 * its original: undefined for a part that is gone (a link's user name, path and query), null for
 * a part that is kept but rewritten, so the place is unknown (a host `URL` read differently).
 */
export interface Replacement {
  text: string;
  kind: RedactedKind;
  spans?: readonly RedactedSpan[];
  slotFor?: (offsetInMatch: number) => number | null | undefined;
}

/** Decides what a match becomes; `undefined` keeps the match as it is. */
export type Decide = (match: string, offset: number, text: string) => Replacement | undefined;

/** A run of the source text that stands unchanged in the result, at `at`. */
export interface Run {
  from: number;
  to: number;
  at: number;
}

/** A tracked text: the spans are sorted by `start`, an outer span before the spans inside it. */
export interface Tracked {
  text: string;
  spans: RedactedSpan[];
  /** The parts of the source that stand unchanged in `text`, in order. */
  kept: Run[];
}

/** Where the source character at `offset` stands in the tracked text, if it still does. */
export function offsetOf(tracked: Tracked, offset: number): number | undefined {
  const run = tracked.kept.find((candidate) => candidate.from <= offset && offset < candidate.to);
  return run && run.at + (offset - run.from);
}

interface Placeholder {
  kind: RedactedKind;
  original: string;
  /** Spans inside this placeholder's text, offsets relative to it. */
  children: RedactedSpan[];
}

interface Segment {
  text: string;
  /** The source range this segment came from (a verbatim segment's text is exactly that slice). */
  from: number;
  to: number;
  /** Set for a replacement. */
  placeholder?: Placeholder;
  /** A later match cut into this replacement: what is left is no whole placeholder. */
  partial?: boolean;
}

/** Stands for a removed name until the end of a pass sequence (see `redact.ts`). */
export const NAME_STAND_IN = String.fromCodePoint(0x1d40d);
const NAME_PLACEHOLDER = '[name]';

/** Sorted by start; an outer span (same start, larger end) before the spans inside it. */
export const sortSpans = (spans: readonly RedactedSpan[]): RedactedSpan[] =>
  spans.toSorted((a, b) => a.start - b.start || b.end - a.end);

const shifted = (span: RedactedSpan, by: number): RedactedSpan => ({
  ...span,
  start: span.start + by,
  end: span.end + by,
});

/** A plain text without replacements, as a tracked one. */
export const untouched = (text: string): Tracked => ({
  text,
  spans: [],
  kept: text === '' ? [] : [{ from: 0, to: text.length, at: 0 }],
});

/**
 * Several tracked parts in a row, their spans moved into place. The kept runs are the first
 * tracked part's (the others' source offsets are not the same text).
 */
export function concat(...parts: (Tracked | string)[]): Tracked {
  let text = '';
  const spans: RedactedSpan[] = [];
  let kept: Run[] | undefined;
  for (const part of parts) {
    if (typeof part === 'string') {
      text += part;
      continue;
    }
    spans.push(...part.spans.map((span) => shifted(span, text.length)));
    kept ??= part.kept.map((run) => ({ ...run, at: run.at + text.length }));
    text += part.text;
  }
  return { text, spans: sortSpans(spans), kept: kept ?? [] };
}

export class Tracker {
  private segments: Segment[];

  constructor(private readonly source: string) {
    this.segments = source === '' ? [] : [{ text: source, from: 0, to: source.length }];
  }

  get text(): string {
    return this.segments.map((segment) => segment.text).join('');
  }

  /**
   * Applies `pattern` (a global regex) over the whole current text, replacing every match that
   * `decide` turns into a {@link Replacement}: the same result as `replaceAll(pattern, …)`.
   */
  pass(pattern: RegExp, decide: Decide): void {
    const text = this.text;
    const matches: { start: number; end: number; replacement: Replacement }[] = [];
    for (const found of text.matchAll(pattern)) {
      if (found[0] === '') continue;
      const replacement = decide(found[0], found.index, text);
      if (replacement) {
        matches.push({ start: found.index, end: found.index + found[0].length, replacement });
      }
    }
    if (matches.length === 0) return;
    const starts: number[] = [];
    let offset = 0;
    for (const segment of this.segments) {
      starts.push(offset);
      offset += segment.text.length;
    }
    // Right to left: a replacement changes only offsets to its right.
    for (let n = matches.length - 1; n >= 0; n--) {
      const { start, end, replacement } = matches[n] ?? { start: 0, end: 0 };
      if (!replacement) continue;
      const a = lastAtOrBefore(starts, start);
      const b = lastAtOrBefore(starts, end - 1);
      const first = this.segments[a];
      if (!first) continue;
      if (a === b && first.placeholder) {
        nest(first, start - (starts[a] ?? 0), end - (starts[a] ?? 0), replacement);
      } else {
        this.cover(a, b, start, end, starts, replacement);
      }
    }
  }

  /** Replaces the text from `start` (in segment `a`) to `end` (in segment `b`). */
  private cover(
    a: number,
    b: number,
    start: number,
    end: number,
    starts: readonly number[],
    replacement: Replacement,
  ): void {
    const first = this.segments[a];
    const last = this.segments[b];
    if (!first || !last) return;
    const localStart = start - (starts[a] ?? 0);
    const localEnd = end - (starts[b] ?? 0);
    const left = localStart > 0 ? remainder(first, 0, localStart) : undefined;
    const right = localEnd < last.text.length ? remainder(last, localEnd) : undefined;
    // The source range: exact in a verbatim segment; a replacement counts as a whole.
    const from = first.placeholder ? first.from : first.from + localStart;
    const to = last.placeholder ? last.to : last.from + localEnd;
    // Names the covered text already held as stand-ins: where the replacement kept them (a
    // link's host, an address's domain), they become children with their original.
    const own = [...(replacement.spans ?? [])];
    const children = [...own];
    /** Covered names the replacement kept without a known place (a rewritten host). */
    const unplaced: string[] = [];
    for (let index = a; index <= b; index++) {
      const segment = this.segments[index];
      const segmentStart = starts[index] ?? 0;
      if (
        segment?.placeholder?.kind !== 'name' ||
        segmentStart < start ||
        segmentStart + segment.text.length > end
      ) {
        continue;
      }
      const slot = replacement.slotFor?.(segmentStart - start);
      // Gone with the replaced text (a link's path): no place, and none to look for.
      if (slot === undefined) continue;
      if (
        slot === null ||
        !replacement.text.startsWith(segment.text, slot) ||
        children.some((span) => span.start < slot + segment.text.length && span.end > slot)
      ) {
        unplaced.push(segment.placeholder.original);
        continue;
      }
      children.push({
        start: slot,
        end: slot + segment.text.length,
        kind: 'name',
        original: segment.placeholder.original,
      });
    }
    // Stand-ins the replacement still holds without a known place (URL rewrote the host, so no
    // offset maps): by order, when their number is exactly the number of names kept without a
    // place. Otherwise none: a wrong original is worse than no tooltip (review round 2). Only
    // names from the kept part count, so a name from a link's path cannot be borrowed by a host
    // that spells the stand-in's marker itself (review round 3).
    const unclaimed: number[] = [];
    for (
      let at = replacement.text.indexOf(NAME_STAND_IN);
      at >= 0;
      at = replacement.text.indexOf(NAME_STAND_IN, at + NAME_STAND_IN.length)
    ) {
      const taken = children.some(
        (span) => span.start < at + NAME_STAND_IN.length && span.end > at,
      );
      if (!taken) unclaimed.push(at);
    }
    if (unplaced.length > 0 && unclaimed.length === unplaced.length) {
      children.push(
        ...unclaimed.map((at, index) => ({
          start: at,
          end: at + NAME_STAND_IN.length,
          kind: 'name' as const,
          original: unplaced[index] ?? '',
        })),
      );
    }
    const segment: Segment = {
      text: replacement.text,
      from,
      to,
      placeholder: {
        kind: replacement.kind,
        original: this.source.slice(from, to),
        children: sortSpans(children),
      },
    };
    this.segments.splice(
      a,
      b - a + 1,
      ...[left, segment, right].filter((part): part is Segment => part !== undefined),
    );
  }

  /** Writes "[name]" for every name stand-in (in name replacements and inside other ones). */
  swapNameStandIns(): void {
    for (const segment of this.segments) {
      const { placeholder } = segment;
      if (!placeholder) continue;
      let at = segment.text.lastIndexOf(NAME_STAND_IN);
      while (at >= 0) {
        const standInEnd = at + NAME_STAND_IN.length;
        const delta = NAME_PLACEHOLDER.length - NAME_STAND_IN.length;
        segment.text =
          segment.text.slice(0, at) + NAME_PLACEHOLDER + segment.text.slice(standInEnd);
        placeholder.children = placeholder.children.map((child) =>
          child.start === at && child.end === standInEnd
            ? { ...child, end: at + NAME_PLACEHOLDER.length }
            : child.start >= standInEnd
              ? shifted(child, delta)
              : child,
        );
        at = at === 0 ? -1 : segment.text.lastIndexOf(NAME_STAND_IN, at - 1);
      }
    }
  }

  /** Removes leading and trailing white space, like `String.trim()`. */
  trim(): void {
    const text = this.text;
    let lead = text.length - text.trimStart().length;
    while (lead > 0 && this.segments.length > 0) {
      const first = this.segments[0];
      if (!first) break;
      if (first.text.length <= lead) {
        lead -= first.text.length;
        this.segments.shift();
      } else {
        this.segments[0] = remainder(first, lead);
        lead = 0;
      }
    }
    let trail = text.length - text.trimEnd().length;
    while (trail > 0 && this.segments.length > 0) {
      const last = this.segments.at(-1);
      if (!last) break;
      if (last.text.length <= trail) {
        trail -= last.text.length;
        this.segments.pop();
      } else {
        this.segments[this.segments.length - 1] = remainder(last, 0, last.text.length - trail);
        trail = 0;
      }
    }
  }

  result(): Tracked {
    const spans: RedactedSpan[] = [];
    const kept: Run[] = [];
    let offset = 0;
    for (const segment of this.segments) {
      const { placeholder } = segment;
      if (placeholder) {
        if (!segment.partial) {
          spans.push({
            start: offset,
            end: offset + segment.text.length,
            kind: placeholder.kind,
            original: placeholder.original,
          });
        }
        spans.push(...placeholder.children.map((child) => shifted(child, offset)));
      } else {
        kept.push({ from: segment.from, to: segment.to, at: offset });
      }
      offset += segment.text.length;
    }
    return { text: this.text, spans: sortSpans(spans), kept };
  }
}

/** The last index whose start is at or before `offset` (the segment that holds it). */
function lastAtOrBefore(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * The part `start..end` of a segment as a segment of its own: a verbatim slice keeps its exact
 * source range, a replacement keeps its placeholder (and the children inside the part).
 */
function remainder(segment: Segment, start: number, end = segment.text.length): Segment {
  const text = segment.text.slice(start, end);
  if (!segment.placeholder) {
    return { text, from: segment.from + start, to: segment.from + end };
  }
  return {
    text,
    from: segment.from,
    to: segment.to,
    placeholder: {
      ...segment.placeholder,
      children: segment.placeholder.children
        .filter((child) => child.start >= start && child.end <= end)
        .map((child) => shifted(child, -start)),
    },
    partial: true,
  };
}

/** A match inside a replacement's text becomes a child span of it. */
function nest(segment: Segment, start: number, end: number, replacement: Replacement): void {
  const { placeholder } = segment;
  if (!placeholder) return;
  const original = segment.text.slice(start, end);
  segment.text = segment.text.slice(0, start) + replacement.text + segment.text.slice(end);
  const delta = replacement.text.length - (end - start);
  const kept = placeholder.children
    .filter((child) => child.end <= start || child.start >= end)
    .map((child) => (child.start >= end ? shifted(child, delta) : child));
  placeholder.children = sortSpans([
    ...kept,
    { start, end: start + replacement.text.length, kind: replacement.kind, original },
    ...(replacement.spans ?? []).map((span) => shifted(span, start)),
  ]);
}
