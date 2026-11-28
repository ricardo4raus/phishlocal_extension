/*
 * The cloud "deep check" in the side panel. Nothing goes to the cloud on its own:
 *
 * 1. The user opens it ("Deep check in the cloud…"): the consent card appears in place of the
 *    red flags and links; the strip and the verdict stay.
 * 2. On the device, the privacy filter builds the data (`cloudData()`) at the chosen privacy
 *    level: no full links, addresses, numbers or IBANs, no raw headers; at level High, Gemini
 *    Nano first looks for names, and they go too. Changing the level builds the data again.
 * 3. The card lists what the filter found and removed (one item per kind) and, one click away,
 *    exactly the data that goes. The data marks every place the filter replaced, from the
 *    filter's own record of positions (`CloudData.spans`), never from a search of the text: an
 *    attacker can write "[name]" into an email. A click on a list item highlights that kind and
 *    scrolls to its places; hovering or focusing a mark shows the original text, struck through,
 *    on the device only.
 * 4. Only "Send to the cloud" sends it, once. Another email, closing the panel, Cancel, Back or
 *    Stop end it.
 *
 * The cloud's answer is read as strictly as the on-device one, and the rules stay its lower limit.
 * What is shown follows docs/ui-design.md ("The consent section").
 */
import type { CloudCheckResult } from '../ai';
import { answerLanguage, buildCloudPrompt, EXPERIMENTAL_LANGUAGES } from '../ai/prompt';
import { localDetail, m } from '../i18n';
import { en } from '../i18n/en';
import { isLanguage } from '../i18n/languages';
import type { Email } from '../email';
import {
  type CloudData,
  cloudData,
  DEFAULT_PRIVACY_LEVEL,
  nameSearchText,
  PRIVACY_LEVELS,
  type PrivacyLevel,
  type RedactedKind,
  type RedactedSpan,
  type Removed,
} from '../privacy/redact';
import type { Finding } from '../rules';
import { HEADERS_WAIT_MS, judge, LINE, STOP_GRACE_MS, WORD } from './ai-view';
import { countElapsed, el, seconds, setText } from './ui';

/**
 * How much longer than the cloud request's own limit the panel waits for it: the request's limit
 * fires first, and this one also bounds a request that does not keep it.
 */
export const CLOUD_LIMIT_EXTRA_MS = 10_000;

/** The name search ended because the email changed or the user stopped it: show nothing. */
const STOPPED = Symbol('stopped');

/** The reason a run is stopped when it reaches its time limit. */
const TIME_LIMIT = 'time limit';

/** The first tooltip over a marked place in the data waits this long (a pointer passing by). */
export const TIP_DELAY_MS = 500;
/** While "warm" (a tooltip showed a moment ago), the next one comes almost at once. */
export const TIP_QUICK_MS = 50;
/** The warm phase ends this long after the last tooltip went. */
export const TIP_WARM_MS = 1000;
/** A tooltip stays this long after the pointer left its mark: time to move onto the tooltip. */
export const TIP_HIDE_MS = 150;
/** The tooltip shows at most this many characters of the original text. */
export const TIP_MAX_CHARS = 300;

export interface DeepCheckElements {
  section: HTMLElement;
  /** The offer: the button and, under it, one line only when recommended or unavailable. */
  start: HTMLButtonElement;
  intro: HTMLElement;
  /** The consent card. */
  consent: HTMLElement;
  back: HTMLButtonElement;
  /** The privacy level: radio buttons named `deep-check-level`, one per PrivacyLevel. */
  levels: HTMLFieldSetElement;
  preview: HTMLElement;
  /** "Found in this email and removed before sending:", or the line that nothing was. */
  removedHeading: HTMLElement;
  /** The `<ul>` under it: one button per kind of removed data (click: highlight in the data). */
  removed: HTMLElement;
  /** "Some names may still be in the text" (shown when the name search could not finish). */
  warning: HTMLElement;
  /** Opens the exact data ("Show what will be sent"). */
  show: HTMLButtonElement;
  /** The data's panel: the `<pre>` with the data and marks, and the tooltip positioned in it. */
  dataPanel: HTMLElement;
  data: HTMLElement;
  /** `role="tooltip"`, hidden; its `<s>` gets the original text of the mark under the pointer. */
  tip: HTMLElement;
  /** "Nothing has been sent yet." in the card: gone from the click on Send until the next reset. */
  nothingYet: HTMLElement;
  send: HTMLButtonElement;
  cancel: HTMLButtonElement;
  /** The status line (a live region), the elapsed time next to it, and Stop. */
  status: HTMLElement;
  elapsed: HTMLElement;
  stop: HTMLButtonElement;
  /** The cloud's result: a band like the on-device one. */
  result: HTMLElement;
  overall: HTMLElement;
  line: HTMLElement;
  reasons: HTMLUListElement;
  advice: HTMLElement;
  source: HTMLElement;
  time: HTMLElement;
  /** Tier 3, in "Email details": how the cloud and the basic checks were combined, timing. */
  detail: HTMLElement;
}

export interface DeepCheckDeps {
  /** The cloud can be reached in this build (it needs App Check). */
  available: boolean;
  /** The panel's language (`language` in src/i18n), e.g. "de": the AI answers in it. */
  panelLanguage: () => string;
  /** Waits until the on-device model is loaded (that can take minutes); says whether it is ready. */
  modelReady: (language: string) => Promise<boolean>;
  /** Gemini Nano, on the device: the names of people in `text`, or undefined if it could not look. */
  findNames: (text: string, language: string, signal: AbortSignal) => Promise<string[] | undefined>;
  /** Sends one prompt to the cloud. Called only after the user agreed to the data in it. */
  run: (prompt: string, signal: AbortSignal) => Promise<CloudCheckResult>;
  /**
   * How long Gemini Nano may look for names before the data is built without its list (settings'
   * `namesTimeoutMs`). It starts after the model is loaded: a load is not the search's fault.
   */
  namesTimeoutMs: number;
  /** The cloud request's own time limit (settings' `cloudTimeoutMs`). */
  cloudTimeoutMs: number;
  headersWaitMs?: number;
  /** The level chosen last time in this browser, if any (any text; checked here). */
  savedLevel?: () => string | undefined;
  /** Remembers the chosen level for the next time. */
  saveLevel?: (level: PrivacyLevel) => void;
  /** The consent card opened or closed: the panel hides the red flags and links meanwhile. */
  onConsent?: (open: boolean) => void;
  /** The AI did not run for the shown email: the deep check is then recommended. */
  aiUnchecked?: () => boolean;
}

export interface DeepCheck {
  /**
   * An email is shown with its rule findings (`undefined` if the rules failed). `final` is false
   * while a Gmail email still waits for its headers: the deep check waits for them too.
   */
  shown(email: Email, findings: Finding[] | undefined, final?: boolean): void;
  /** No email is shown any more. */
  hidden(): void;
}

const NOT_AVAILABLE = m.deepCheck.notAvailable;

const isPrivacyLevel = (value: string | undefined): value is PrivacyLevel =>
  PRIVACY_LEVELS.some((level) => level === value);

/** The kinds in the order the list shows them, with their count in {@link Removed}. */
const KINDS: readonly { kind: RedactedKind; count: keyof Removed }[] = [
  { kind: 'name', count: 'names' },
  { kind: 'email', count: 'emails' },
  { kind: 'number', count: 'numbers' },
  { kind: 'iban', count: 'ibans' },
  { kind: 'link', count: 'links' },
];

const isKind = (value: string | undefined): value is RedactedKind =>
  KINDS.some(({ kind }) => kind === value);

/** The list items: one per kind the filter removed, with its count ("2 email addresses"). */
export function removedItems(removed: Removed): { kind: RedactedKind; text: string }[] {
  const text = m.deepCheck.items;
  return KINDS.filter(({ count }) => removed[count] > 0).map(({ kind, count }) => ({
    kind,
    text: text[count](removed[count]),
  }));
}

/** A mark in the data: the element, what it stands for and the text that stood there. */
export interface Mark {
  element: HTMLElement;
  kind: RedactedKind;
  original: string;
}

/** Appends `text` to `parent` as a text node (never markup); nothing for an empty string. */
function appendText(parent: HTMLElement, text: string): void {
  if (text !== '') parent.append(document.createTextNode(text));
}

/**
 * Fills `pre` with `json` as text and wraps every span in a `<mark class="redacted">`; a span
 * inside another gives a mark inside a mark. The text stays exactly `json`: the marks only wrap
 * it. Spans are the filter's record of what it replaced; the text is never searched for
 * placeholders (an attacker can write "[name]" into an email). A span out of bounds, empty or
 * crossing another is left out, so a wrong record can only lose a mark, never change the text.
 * Returns the marks in text order.
 */
export function renderRedacted(
  pre: HTMLElement,
  json: string,
  spans: readonly RedactedSpan[],
): Mark[] {
  const marks: Mark[] = [];
  // By start; of two at the same start, the longer (outer) one first.
  const ordered = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  /** The marks not closed yet, outermost first, each with where its text ends. */
  const open: { element: HTMLElement; end: number }[] = [];
  /** The text before this offset is in the DOM. */
  let pos = 0;
  const container = (): HTMLElement => open.at(-1)?.element ?? pre;
  const close = (): void => {
    const top = open.pop();
    if (!top) return;
    appendText(top.element, json.slice(pos, top.end));
    pos = top.end;
  };
  pre.replaceChildren();
  for (const span of ordered) {
    const { start, end } = span;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end > json.length ||
      end <= start ||
      !isKind(span.kind)
    ) {
      continue;
    }
    while (open.length > 0 && (open.at(-1)?.end ?? 0) <= start) close();
    // Crossing a mark already closed, or reaching past the one around it: not nested, left out.
    if (start < pos) continue;
    const outer = open.at(-1);
    if (outer && end > outer.end) continue;
    appendText(container(), json.slice(pos, start));
    pos = start;
    const element = el('mark', 'redacted');
    element.dataset.kind = span.kind;
    element.tabIndex = -1;
    container().append(element);
    open.push({ element, end });
    marks.push({ element, kind: span.kind, original: span.original });
  }
  while (open.length > 0) close();
  appendText(pre, json.slice(pos));
  return marks;
}

/** Runs `work` and never throws, also when it throws before returning a promise. */
async function settle<T>(work: () => Promise<T>, fallback: (error: unknown) => T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    return fallback(error);
  }
}

/**
 * Runs `work`, which follows `controller`, for at most `limitMs` (then it is stopped with the reason
 * {@link TIME_LIMIT}). After any stop it gets STOP_GRACE_MS to end; one that ignores its signal is
 * given up, so the panel never waits forever. Never throws: errors and give-ups become `fallback`.
 */
async function bounded<T>(
  work: () => Promise<T>,
  controller: AbortController,
  limitMs: number,
  fallback: (error: unknown) => T,
): Promise<T> {
  let grace: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const givenUp = new Promise<T>((resolve) => {
    onAbort = () => {
      grace = setTimeout(() => resolve(fallback(controller.signal.reason)), STOP_GRACE_MS);
    };
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  const limit = setTimeout(() => controller.abort(TIME_LIMIT), limitMs);
  try {
    return await Promise.race([settle(work, fallback), givenUp]);
  } finally {
    if (onAbort) controller.signal.removeEventListener('abort', onAbort);
    clearTimeout(limit);
    clearTimeout(grace);
  }
}

const set = (element: HTMLElement, text: string): void => {
  element.textContent = text;
};

interface Shown {
  email: Email;
  findings: Finding[] | undefined;
  final: boolean;
  /** Same email and findings give the same key: Gmail shows an email several times. */
  key: string;
  /** The email without its headers: the same message, with or without them. */
  base: string;
}

type Phase = 'idle' | 'preparing' | 'preview' | 'sending' | 'done';

/**
 * What the user is told when the email changes under a deep check, by phase. Gmail also shows
 * the same email again with new details (its headers), so "changed" covers both. Nothing after a
 * finished check: its result leaves with its email, and a note under the next email's button
 * would talk about an email no longer shown (fresh-Chrome test, 26 Nov 2026).
 */
const CHANGED: Record<Phase, string> = m.deepCheck.changed;

export function createDeepCheck(elements: DeepCheckElements, deps: DeepCheckDeps): DeepCheck {
  const { namesTimeoutMs } = deps;
  const cloudLimitMs = deps.cloudTimeoutMs + CLOUD_LIMIT_EXTRA_MS;
  let shown: Shown | undefined;
  let phase: Phase = 'idle';
  /** The consent card is open (preparing, preview or sending; also kept open after a failure). */
  let consentOpen = false;
  /** The data shown for consent; only this is ever sent. */
  let prepared: { data: CloudData; language: string } | undefined;
  /** Stops the name search or the cloud request in progress. */
  let stop: AbortController | undefined;
  /** Clears the elapsed-time counter. */
  let stopCounting: (() => void) | undefined;
  /** Changes whenever the email changes or the user cancels: late results are dropped. */
  let generation = 0;
  /** The marks in the shown data, in text order. */
  let marks: Mark[] = [];
  /** Per kind, which of its marks the list item's next click goes to (they cycle). */
  let current: Partial<Record<RedactedKind, number>> = {};
  /** The mark whose original the tooltip shows, while it shows. */
  let tipFor: Mark | undefined;
  /** Waits before a hovered mark's tooltip shows. */
  let tipTimer: ReturnType<typeof setTimeout> | undefined;
  /** Waits after the pointer left a mark before the tooltip goes (it may land on the tooltip). */
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  /** Ends the warm phase, in which the next tooltip comes almost at once. */
  let warmTimer: ReturnType<typeof setTimeout> | undefined;
  let warm = false;
  // The status can take the focus from a button that disappears (not by Tab).
  elements.status.tabIndex = -1;

  const radios = (): HTMLInputElement[] => [
    ...elements.levels.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ];
  const saved = deps.savedLevel?.();
  const initial = isPrivacyLevel(saved) ? saved : DEFAULT_PRIVACY_LEVEL;
  for (const radio of radios()) radio.checked = radio.value === initial;
  /** The chosen level; an unknown value (a changed page) counts as the stricter one. */
  const level = (): PrivacyLevel => {
    const checked = radios().find((radio) => radio.checked)?.value;
    return isPrivacyLevel(checked) ? checked : 'high';
  };
  const setLevelsDisabled = (disabled: boolean): void => {
    elements.levels.disabled = disabled;
  };

  const language = (): string => answerLanguage(deps.panelLanguage());

  /**
   * The line under the offer button (only when the deep check is recommended or unavailable), and
   * whether it is a recommendation.
   */
  function intro(): { text: string; recommended: boolean } {
    if (!deps.available) return { text: NOT_AVAILABLE, recommended: false };
    if (shown && !shown.final) return { text: m.deepCheck.waitingHeaders, recommended: false };
    const answerIn = language();
    if (EXPERIMENTAL_LANGUAGES.has(answerIn)) {
      const name = isLanguage(answerIn) ? m.languageNames[answerIn] : answerIn;
      return { text: m.deepCheck.recommendedExperimental(name), recommended: true };
    }
    if (deps.aiUnchecked?.()) return { text: m.deepCheck.recommendedUnchecked, recommended: true };
    return { text: '', recommended: false };
  }

  /** The offer button: filled when recommended, disabled when the cloud cannot be reached. */
  function showOffer(): void {
    const { text, recommended } = intro();
    set(elements.intro, text);
    elements.start.disabled = !deps.available || !shown?.final;
    elements.start.classList.toggle('btn--primary', recommended);
  }

  function setConsent(open: boolean): void {
    const changed = consentOpen !== open;
    consentOpen = open;
    elements.consent.hidden = !open;
    elements.start.hidden = open;
    elements.intro.hidden = open;
    if (changed) deps.onConsent?.(open);
  }

  function clearCounter(): void {
    stopCounting?.();
    stopCounting = undefined;
  }

  function clearResult(): void {
    elements.result.hidden = true;
    delete elements.result.dataset.risk;
    for (const element of [
      elements.overall,
      elements.line,
      elements.advice,
      elements.source,
      elements.time,
      elements.detail,
    ]) {
      set(element, '');
    }
    elements.reasons.replaceChildren();
  }

  /* ---- The marks in the data: roving tabindex, the selected kind, the tooltip. ---- */

  const marksOf = (kind: RedactedKind): Mark[] => marks.filter((mark) => mark.kind === kind);

  /** Exactly one mark is reached by Tab (`target`); the arrow keys move between the others. */
  function setTabbable(target: HTMLElement | undefined): void {
    for (const { element } of marks) element.tabIndex = element === target ? 0 : -1;
  }

  /** The mark at (or around) an event's target, if it is one of the data's marks. */
  function markAt(target: EventTarget | null): Mark | undefined {
    if (!(target instanceof Element)) return undefined;
    const element = target.closest('.redacted');
    return element ? marks.find((mark) => mark.element === element) : undefined;
  }

  function clearTipTimers(): void {
    clearTimeout(tipTimer);
    clearTimeout(hideTimer);
    clearTimeout(warmTimer);
    tipTimer = hideTimer = warmTimer = undefined;
  }

  /**
   * Places the tooltip above the mark, inside the data panel (its positioning context; the data
   * itself scrolls, so the tooltip lives next to it, not in it). Below the mark when there is no
   * room above; never past the panel's edges. Physical offsets, because the rectangles are too.
   */
  function placeTip(mark: HTMLElement): void {
    const { tip } = elements;
    // Measured from the panel's left edge: at its old place near the right edge the tooltip would
    // measure narrow and tall (shrink-to-fit width ends at the panel's edge; found in review).
    tip.style.top = '0px';
    tip.style.left = '0px';
    const panel = elements.dataPanel.getBoundingClientRect();
    const place = mark.getBoundingClientRect();
    let top = place.top - panel.top - tip.offsetHeight;
    if (top < 0) top = place.bottom - panel.top;
    const left = Math.max(0, Math.min(place.left - panel.left, panel.width - tip.offsetWidth));
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }

  /** Shows the original text of `mark`, struck through, at once. */
  function showTip(mark: Mark): void {
    clearTipTimers();
    if (tipFor && tipFor !== mark) tipFor.element.removeAttribute('aria-describedby');
    tipFor = mark;
    const { original } = mark;
    // Cut between code points: a surrogate pair split at the limit would show as "\uFFFD".
    const cut =
      original.length > TIP_MAX_CHARS
        ? `${original.slice(0, TIP_MAX_CHARS).replace(/[\uD800-\uDBFF]$/u, '')}…`
        : original;
    // Email text: as text only, with direction overrides revealed.
    setText(elements.tip.querySelector<HTMLElement>('s') ?? elements.tip, cut);
    mark.element.setAttribute('aria-describedby', elements.tip.id);
    elements.tip.hidden = false;
    placeTip(mark.element);
  }

  /** Hides the tooltip (and drops a pending one); the next one then comes quickly for a moment. */
  function hideTip(): void {
    clearTimeout(tipTimer);
    clearTimeout(hideTimer);
    tipTimer = hideTimer = undefined;
    if (!tipFor) return;
    tipFor.element.removeAttribute('aria-describedby');
    tipFor = undefined;
    elements.tip.hidden = true;
    warm = true;
    clearTimeout(warmTimer);
    warmTimer = setTimeout(() => {
      warm = false;
      warmTimer = undefined;
    }, TIP_WARM_MS);
  }

  function setDataOpen(open: boolean): void {
    elements.dataPanel.hidden = !open;
    elements.show.setAttribute('aria-expanded', String(open));
    if (!open) hideTip();
  }

  /**
   * A click on the list item for `kind`: the data opens, that kind's marks turn yellow (the CSS
   * reads `data-selected-kind`), and the view scrolls to its first mark; a repeat click goes on
   * to the next one. From the keyboard the focus moves to that mark too, so the arrow keys and
   * the tooltip are at hand; a mouse click leaves the focus on the item.
   */
  function selectKind(kind: RedactedKind, byKeyboard: boolean): void {
    const own = marksOf(kind);
    const same = elements.data.dataset.selectedKind === kind;
    current[kind] = same && own.length > 0 ? ((current[kind] ?? 0) + 1) % own.length : 0;
    elements.data.dataset.selectedKind = kind;
    for (const item of elements.removed.querySelectorAll<HTMLElement>('.removed__item')) {
      if (item.dataset.kind === kind) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    }
    setDataOpen(true);
    const mark = own[current[kind] ?? 0];
    if (!mark) return;
    setTabbable(mark.element);
    scrollDataTo(mark.element);
    // Not `focus()` alone: it would scroll every ancestor too (see scrollDataTo).
    if (byKeyboard) mark.element.focus({ preventScroll: true });
  }

  /**
   * Scrolls the data, and only the data, so that `mark` is in view (centred); nothing when it is
   * already. `scrollIntoView()` would scroll every ancestor as well, so a click on a list item
   * could move the whole panel and the list under the pointer (found in review).
   */
  function scrollDataTo(mark: HTMLElement): void {
    const box = elements.data.getBoundingClientRect();
    const place = mark.getBoundingClientRect();
    if (place.top >= box.top && place.bottom <= box.bottom) return;
    // Clamped at the top like the browser does, so the tests see the same value.
    elements.data.scrollTop = Math.max(
      0,
      elements.data.scrollTop + place.top - box.top - (box.height - place.height) / 2,
    );
  }

  /** Shows the list of what was removed, and the data with its marks. */
  function showData(data: CloudData, chosen: PrivacyLevel): void {
    const items = removedItems(data.removed);
    set(
      elements.removedHeading,
      items.length > 0 ? m.deepCheck.foundAndRemoved : m.deepCheck.nothingToRemove[chosen],
    );
    elements.removed.hidden = items.length === 0;
    elements.removed.replaceChildren(
      ...items.map(({ kind, text }) => {
        const button = el('button', 'removed__item', text);
        button.type = 'button';
        button.dataset.kind = kind;
        const item = el('li');
        item.append(button);
        return item;
      }),
    );
    marks = renderRedacted(elements.data, data.json, data.spans);
    current = {};
    setTabbable(marks[0]?.element);
  }

  function clearPreview(): void {
    prepared = undefined;
    elements.preview.hidden = true;
    set(elements.removedHeading, '');
    elements.removed.replaceChildren();
    elements.removed.hidden = false;
    hideTip();
    clearTipTimers();
    warm = false;
    marks = [];
    current = {};
    elements.data.replaceChildren();
    delete elements.data.dataset.selectedKind;
    elements.warning.hidden = true;
    setDataOpen(false);
    elements.send.hidden = false;
    elements.cancel.hidden = false;
  }

  /** Back to the start for the shown email: no preview, no result, nothing running. */
  function reset(status = '', { keepResult = false, close = true } = {}): void {
    // Taken first: a focused mark in the data is removed with the preview (it is then detached).
    const focused = document.activeElement;
    const focusInside = focused !== null && elements.section.contains(focused);
    generation++;
    stop?.abort();
    stop = undefined;
    clearCounter();
    phase = 'idle';
    clearPreview();
    if (!keepResult) clearResult();
    set(elements.status, status);
    elements.status.classList.remove('status--error');
    elements.stop.hidden = true;
    elements.back.disabled = false;
    elements.nothingYet.hidden = false;
    setLevelsDisabled(!deps.available);
    if (close) setConsent(false);
    showOffer();
    // Focus on a button that was just hidden (Stop, Send) or on a removed mark would be lost: move
    // it to the start, or to the status while the start waits (found in review round 3).
    if (focusInside && (!focused.isConnected || focused.closest('[hidden]'))) {
      (elements.start.disabled || elements.start.hidden ? elements.status : elements.start).focus();
    } else if (focused === elements.status && !elements.start.disabled && !elements.start.hidden) {
      elements.start.focus();
    }
  }

  /** Shows the status line with the elapsed time and Stop while something runs. */
  function running(status: string): void {
    set(elements.status, status);
    elements.status.classList.remove('status--error');
    clearCounter();
    stopCounting = countElapsed(elements.elapsed);
    elements.stop.hidden = false;
  }

  /**
   * Gemini Nano's names for the email, or undefined if it could not look (then names may remain);
   * {@link STOPPED} if the email changed or the user stopped meanwhile.
   */
  async function searchNames(
    email: Email,
    answerIn: string,
  ): Promise<string[] | undefined | typeof STOPPED> {
    const mine = generation;
    phase = 'preparing';
    const controller = new AbortController();
    stop = controller;
    setLevelsDisabled(true);
    running(m.deepCheck.waitingModel);
    // Not inside the search's time limit: a load can take minutes ("Stop" ends the wait).
    const ready = await settle(
      () => deps.modelReady(answerIn),
      () => false,
    );
    if (mine !== generation) return STOPPED;
    let names: string[] | undefined;
    if (ready) {
      running(m.deepCheck.lookingForNames);
      names = await bounded(
        () => deps.findNames(nameSearchText(email), answerIn, controller.signal),
        controller,
        namesTimeoutMs,
        () => undefined,
      );
      if (mine !== generation) return STOPPED;
    }
    stop = undefined;
    // A search stopped by the time limit may still answer: its list is not trusted to be complete.
    return controller.signal.aborted ? undefined : names;
  }

  /** Builds the data at the chosen level and shows the preview. Never throws. */
  async function prepare(): Promise<void> {
    if (!shown?.final || !deps.available || phase === 'preparing' || phase === 'sending') return;
    const { email, findings } = shown;
    const answerIn = language();
    // Fixed for this preview: changing it builds the data again (see the listener below).
    const chosen = level();
    // The offer button goes away with the card: its focus moves to the card. A focus on the
    // level cards (a keyboard user changing the level) stays there.
    const fromOffer = document.activeElement === elements.start;
    reset('', { close: false });
    setConsent(true);
    if (fromOffer) elements.consent.focus();
    try {
      // "standard" keeps names: no model, no name search, nothing to wait for or stop.
      const found = chosen === 'high' ? await searchNames(email, answerIn) : [];
      if (found === STOPPED) return;
      const data = cloudData(email, findings ?? [], found, chosen);
      prepared = { data, language: answerIn };
      phase = 'preview';
      clearCounter();
      elements.stop.hidden = true;
      setLevelsDisabled(false);
      showData(data, chosen);
      elements.warning.hidden = data.namesChecked;
      elements.preview.hidden = false;
      set(elements.status, '');
      // Never on Send: a second Enter must not send data the user has not looked at.
      if (!elements.levels.contains(document.activeElement)) elements.preview.focus();
    } catch (error) {
      console.error('PhishLocal: the deep check could not prepare its data', error);
      reset(m.deepCheck.prepareFailed);
      elements.status.classList.add('status--error');
    }
  }

  function showResult(
    result: CloudCheckResult,
    findings: Finding[] | undefined,
    email: Email,
  ): void {
    phase = 'done';
    clearCounter();
    elements.stop.hidden = true;
    elements.back.disabled = false;
    setLevelsDisabled(false);
    if (!result.ok) {
      set(
        elements.status,
        result.reason === 'stopped'
          ? m.deepCheck.stopped
          : result.reason === 'limit'
            ? m.deepCheck.limit
            : result.reason === 'unreadable-answer'
              ? m.deepCheck.unreadable
              : m.deepCheck.failed,
      );
      elements.status.classList.add('status--error');
      // What went wrong, in the cloud's or the network's words: tier 3.
      set(
        elements.detail,
        result.reason === 'failed'
          ? m.deepCheck.failedDetail(localDetail(result.detail ?? m.aiCheck.unknownError))
          : '',
      );
      // The card stays open with the data as the record; a new click on Send is a new consent
      // to the same, still shown data.
      elements.send.hidden = false;
      elements.cancel.hidden = false;
      phase = 'preview';
      elements.status.focus();
      return;
    }
    // Sent and answered: this consent is used up.
    prepared = undefined;
    const { verdict } = result;
    const judged = judge(verdict, findings, email, m.judge.theCloudAi);
    elements.result.dataset.risk = judged.overall;
    elements.result.hidden = false;
    set(elements.overall, m.deepCheck.resultWord(WORD[judged.overall]));
    set(elements.line, LINE[judged.overall]);
    elements.reasons.replaceChildren(
      ...judged.reasons.map((reason) => {
        const item = document.createElement('li');
        item.textContent = reason;
        return item;
      }),
    );
    set(elements.advice, judged.advice);
    set(elements.source, m.deepCheck.source);
    set(elements.time, m.verdict.doneIn(seconds(result.durationMs)));
    set(
      elements.detail,
      [judged.detail, m.deepCheck.note(seconds(result.durationMs))]
        .filter((part) => part !== '')
        .join(' '),
    );
    // No status: the result band and the open card say it all (fresh-Chrome test, 26 Nov 2026).
    set(elements.status, '');
    elements.result.focus();
  }

  async function send(): Promise<void> {
    if (!shown || !prepared || phase !== 'preview') return;
    const { email, findings } = shown;
    const { data, language: answerIn } = prepared;
    const mine = generation;
    phase = 'sending';
    setLevelsDisabled(true);
    // The data stays visible as the record of what was sent; it is sent only once.
    elements.send.hidden = true;
    elements.cancel.hidden = true;
    elements.back.disabled = true;
    // From here on the data may have reached the cloud, also after a failure or a stop.
    elements.nothingYet.hidden = true;
    running(m.deepCheck.checking);
    elements.stop.focus();
    const controller = new AbortController();
    stop = controller;
    const answer = await bounded(
      () =>
        deps.run(
          buildCloudPrompt(data.json, answerIn, email.headers?.sentToSelf === true),
          controller.signal,
        ),
      controller,
      cloudLimitMs,
      (error): CloudCheckResult =>
        controller.signal.aborted
          ? { ok: false, reason: 'stopped' }
          : {
              ok: false,
              reason: 'failed',
              detail: error instanceof Error ? error.message : String(error),
            },
    );
    if (mine !== generation) return;
    stop = undefined;
    const result: CloudCheckResult =
      controller.signal.reason === TIME_LIMIT && !answer.ok
        ? {
            ok: false,
            reason: 'failed',
            detail: en.errors.noAnswerWithin(String(cloudLimitMs / 1000)),
          }
        : answer;
    try {
      showResult(result, findings, email);
    } catch (error) {
      console.error('PhishLocal: the deep check could not show its result', error);
      reset(m.deepCheck.showFailed, { keepResult: false, close: false });
      elements.status.classList.add('status--error');
    }
  }

  elements.start.addEventListener('click', () => void prepare());
  elements.send.addEventListener('click', () => void send());
  elements.show.addEventListener('click', () => {
    const open = elements.dataPanel.hidden !== false;
    setDataOpen(open);
    if (open) elements.data.focus();
  });
  elements.removed.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const kind = target.closest<HTMLElement>('.removed__item')?.dataset.kind;
    // Enter or Space on the item is a click without a pointer (detail 0).
    if (isKind(kind)) selectKind(kind, event.detail === 0);
  });
  // Inside the data: Escape hides the tooltip; from a mark, the arrow keys, Home and End move
  // between the marks (the data's own scrolling by arrow keys stays when no mark is focused).
  elements.data.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideTip();
      return;
    }
    const index = marks.findIndex((mark) => mark.element === event.target);
    if (index < 0) return;
    const last = marks.length - 1;
    const to =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? Math.min(index + 1, last)
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    const mark = to === undefined ? undefined : marks[to];
    if (!mark) return;
    event.preventDefault();
    setTabbable(mark.element);
    mark.element.focus();
  });
  // The tooltip: after a delay for the first hovered mark, almost at once while warm, and at once
  // for a focused mark. It goes a moment after the pointer leaves (unless it lands on the tooltip),
  // on blur, Escape, and when the data scrolls (its place would be stale).
  elements.data.addEventListener('mouseover', (event) => {
    const mark = markAt(event.target);
    if (!mark) return;
    clearTimeout(hideTimer);
    hideTimer = undefined;
    if (tipFor === mark) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => showTip(mark), warm || tipFor ? TIP_QUICK_MS : TIP_DELAY_MS);
  });
  // When the pointer leaves, a focused mark gets its tooltip back (the pointer passing over the
  // data must not take a keyboard user's tooltip away; found in review); else the tooltip goes.
  const leaveTip = (): void => {
    clearTimeout(tipTimer);
    clearTimeout(hideTimer);
    tipTimer = undefined;
    hideTimer = setTimeout(() => {
      const focused = markAt(document.activeElement);
      if (focused) showTip(focused);
      else hideTip();
    }, TIP_HIDE_MS);
  };
  elements.data.addEventListener('mouseout', (event) => {
    if (markAt(event.target)) leaveTip();
  });
  elements.tip.addEventListener('mouseover', () => {
    clearTimeout(hideTimer);
    hideTimer = undefined;
  });
  elements.tip.addEventListener('mouseout', (event) => {
    // Back onto a mark: the data's own handler takes over.
    if (!markAt(event.relatedTarget)) leaveTip();
  });
  elements.data.addEventListener('focusin', (event) => {
    const mark = markAt(event.target);
    if (mark) showTip(mark);
  });
  elements.data.addEventListener('focusout', (event) => {
    if (markAt(event.target)) hideTip();
  });
  // The data scrolled: a hovered mark's tooltip goes (the pointer is over something else now); a
  // focused mark's follows it (the focus itself scrolls the mark into view), or goes with it.
  elements.data.addEventListener('scroll', () => {
    if (!tipFor) return;
    const mark = tipFor.element;
    const place = mark.getBoundingClientRect();
    const view = elements.data.getBoundingClientRect();
    if (document.activeElement === mark && place.bottom >= view.top && place.top <= view.bottom) {
      placeTip(mark);
    } else {
      hideTip();
    }
  });
  elements.levels.addEventListener('change', () => {
    deps.saveLevel?.(level());
    // The preview must show exactly what goes: the data is built again at the new level.
    if (phase === 'preview') {
      void prepare();
    } else if (phase === 'done') {
      // The result stays readable; the data above was sent at the level chosen before.
      set(elements.status, m.deepCheck.levelChanged);
    }
  });
  // A click anywhere on a level card chooses it (the list is not inside the label).
  elements.levels.addEventListener('click', (event) => {
    if (elements.levels.disabled) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, label')) return;
    const card = target.closest<HTMLElement>('[data-level]');
    const radio = card?.querySelector<HTMLInputElement>('input[type="radio"]');
    if (radio && !radio.checked) radio.click();
  });
  const cancel = (): void => {
    if (phase === 'preview' || phase === 'preparing') {
      reset(m.deepCheck.nothingSent);
      elements.start.focus();
    }
  };
  elements.cancel.addEventListener('click', cancel);
  elements.back.addEventListener('click', () => {
    if (phase === 'preview' || phase === 'preparing') {
      cancel();
    } else if (phase !== 'sending') {
      // Done, or nothing prepared: close the card (the sent data goes with it) and keep the
      // result. While the data is on its way, Stop is the way out (the button is disabled then),
      // so the record stays in view.
      clearPreview();
      setConsent(false);
      showOffer();
      elements.start.focus();
    }
  });
  elements.stop.addEventListener('click', () => {
    if (phase === 'preparing') {
      reset(m.deepCheck.stoppedNothingSent);
      elements.start.focus();
    } else if (phase === 'sending') {
      // The request may already be out; send() reports the stop.
      stop?.abort();
    }
  });

  /** Ends the wait for a Gmail email's headers: like the on-device check, at most a few seconds. */
  let headersWait: ReturnType<typeof setTimeout> | undefined;

  function markFinal(): void {
    clearTimeout(headersWait);
    if (!shown || shown.final) return;
    shown.final = true;
    if (phase === 'idle') reset(elements.status.textContent ?? '');
  }

  return {
    shown(email, findings, final = true) {
      const key = JSON.stringify([email, findings ?? null]);
      if (shown?.key === key) {
        // The same email: only the headers wait may have ended.
        if (final) markFinal();
        return;
      }
      clearTimeout(headersWait);
      // Gmail shows an email again in two steps (without headers, then with them): a note from
      // the first step stays through the second (found in review).
      const base = JSON.stringify({ ...email, headers: undefined });
      const note = !shown
        ? ''
        : phase !== 'idle'
          ? CHANGED[phase]
          : shown.base === base
            ? (elements.status.textContent ?? '')
            : '';
      shown = { email, findings, final, key, base };
      elements.section.hidden = false;
      reset(note);
      if (!final) headersWait = setTimeout(markFinal, deps.headersWaitMs ?? HEADERS_WAIT_MS);
    },
    hidden() {
      clearTimeout(headersWait);
      shown = undefined;
      reset();
      elements.section.hidden = true;
    },
  };
}
