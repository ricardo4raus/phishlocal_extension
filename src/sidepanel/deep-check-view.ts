/*
 * The cloud "deep check" in the side panel. Nothing goes to the cloud on its own:
 *
 * 1. The user asks for it ("Prepare a deep check").
 * 2. On the device, Gemini Nano looks for names, and the privacy filter builds the data
 *    (`cloudData()`): no full links, addresses, numbers, IBANs or names, no raw headers.
 * 3. The panel shows exactly that data and what was removed.
 * 4. Only "Send to the cloud" sends it, once. Another email, closing the panel or "Stop" ends it.
 *
 * The cloud's answer is read as strictly as the on-device one, and the rules stay its lower limit.
 */
import type { AiCheckResult } from '../ai';
import {
  AI_LANGUAGES,
  answerLanguage,
  buildCloudPrompt,
  EXPERIMENTAL_LANGUAGES,
} from '../ai/prompt';
import type { Email } from '../email';
import {
  type CloudData,
  cloudData,
  DEFAULT_PRIVACY_LEVEL,
  nameSearchText,
  PRIVACY_LEVELS,
  type PrivacyLevel,
  type Removed,
} from '../privacy/redact';
import type { Finding } from '../rules';
import { HEADERS_WAIT_MS, judge, STOP_GRACE_MS } from './ai-view';

/**
 * How much longer than the cloud request's own limit the panel waits for it: the request's limit
 * fires first, and this one also bounds a request that does not keep it.
 */
export const CLOUD_LIMIT_EXTRA_MS = 10_000;

/** The name search ended because the email changed or the user stopped it: show nothing. */
const STOPPED = Symbol('stopped');

/** The reason a run is stopped when it reaches its time limit. */
const TIME_LIMIT = 'time limit';

export interface DeepCheckElements {
  section: HTMLElement;
  intro: HTMLElement;
  start: HTMLButtonElement;
  /** The privacy level: its options' values are the PrivacyLevel names. */
  level: HTMLSelectElement;
  /** Stops the name search or the cloud request. */
  stop: HTMLButtonElement;
  preview: HTMLElement;
  removed: HTMLElement;
  data: HTMLElement;
  send: HTMLButtonElement;
  cancel: HTMLButtonElement;
  status: HTMLElement;
  result: HTMLElement;
  overall: HTMLElement;
  note: HTMLElement;
  reasons: HTMLUListElement;
  advice: HTMLElement;
}

export interface DeepCheckDeps {
  /** The cloud can be reached in this build (it needs App Check). */
  available: boolean;
  /** Chrome's UI language, e.g. "de-CH". */
  uiLanguage: () => string;
  /** Waits until the on-device model is loaded (that can take minutes); says whether it is ready. */
  modelReady: (language: string) => Promise<boolean>;
  /** Gemini Nano, on the device: the names of people in `text`, or undefined if it could not look. */
  findNames: (text: string, language: string, signal: AbortSignal) => Promise<string[] | undefined>;
  /** Sends one prompt to the cloud. Called only after the user agreed to the data in it. */
  run: (prompt: string, signal: AbortSignal) => Promise<AiCheckResult>;
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

const CLOUD_NOTE = 'Cloud (Gemini via Firebase AI Logic). AI can be wrong.';

const NAMES_MAY_REMAIN =
  'Not every name could be checked on this device, so names may remain: read the data before you send it.';

const PREVIEW_STATUS: Record<PrivacyLevel, string> = {
  standard:
    'This is everything that will be sent, besides our fixed instructions. Names are kept (privacy level Standard).',
  high: 'This is everything that will be sent, besides our fixed instructions.',
};

const isPrivacyLevel = (value: string | undefined): value is PrivacyLevel =>
  PRIVACY_LEVELS.some((level) => level === value);

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** "2 names, 1 email address (domain kept), …", or a note that nothing was found. */
export function removedSummary(removed: Removed): string {
  const parts = [
    removed.names > 0 && plural(removed.names, 'name', 'names'),
    removed.emails > 0 &&
      `${plural(removed.emails, 'email address', 'email addresses')} (domain kept)`,
    removed.numbers > 0 &&
      plural(removed.numbers, 'phone or other long number', 'phone or other long numbers'),
    removed.ibans > 0 && plural(removed.ibans, 'IBAN', 'IBANs'),
    removed.links > 0 && `${plural(removed.links, 'link', 'links')} in the text (host kept)`,
  ].filter((part) => part !== false);
  return parts.length > 0
    ? `Removed on this device: ${parts.join(', ')}. Links are sent as their domain only.`
    : 'No personal data found to remove. Links are sent as their domain only.';
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
 * the same email again with new details (its headers), so "changed" covers both.
 */
const CHANGED: Record<Phase, string> = {
  idle: '',
  preparing: 'The email changed, so the deep check was stopped. Nothing was sent.',
  preview: 'The email changed, so the prepared data was discarded. Nothing was sent.',
  sending:
    'The email changed while the deep check ran: its data had been sent, its answer was dropped.',
  done: 'The email changed, so the deep check result was cleared.',
};

export function createDeepCheck(elements: DeepCheckElements, deps: DeepCheckDeps): DeepCheck {
  const { namesTimeoutMs } = deps;
  const cloudLimitMs = deps.cloudTimeoutMs + CLOUD_LIMIT_EXTRA_MS;
  let shown: Shown | undefined;
  let phase: Phase = 'idle';
  /** The data shown for consent; only this is ever sent. */
  let prepared: { data: CloudData; language: string } | undefined;
  /** Stops the name search or the cloud request in progress. */
  let stop: AbortController | undefined;
  /** Changes whenever the email changes or the user cancels: late results are dropped. */
  let generation = 0;
  // The status can take the focus from a button that disappears (not by Tab).
  elements.status.tabIndex = -1;

  const saved = deps.savedLevel?.();
  elements.level.value = isPrivacyLevel(saved) ? saved : DEFAULT_PRIVACY_LEVEL;
  /** The chosen level; an unknown value (a changed page) counts as the stricter one. */
  const level = (): PrivacyLevel =>
    isPrivacyLevel(elements.level.value) ? elements.level.value : 'high';

  const language = (): string => answerLanguage(deps.uiLanguage());

  function intro(): string {
    if (!deps.available) {
      return 'Not available in this build: the cloud needs App Check, which only the development build and the judges build have.';
    }
    if (shown && !shown.final) return 'Waiting for the sender checks of this email…';
    const lead = EXPERIMENTAL_LANGUAGES.has(language())
      ? `Recommended: on-device answers in ${AI_LANGUAGES[language()] ?? 'English'} are experimental.`
      : 'Optional:';
    return `${lead} A larger AI model in the cloud checks this email again. Nothing is sent before you have seen the data and agreed.`;
  }

  /** Back to the start for the shown email: no preview, no result, nothing running. */
  function reset(status = ''): void {
    generation++;
    stop?.abort();
    stop = undefined;
    prepared = undefined;
    phase = 'idle';
    elements.preview.hidden = true;
    elements.result.hidden = true;
    delete elements.result.dataset.risk;
    for (const element of [elements.removed, elements.data, elements.overall, elements.note]) {
      set(element, '');
    }
    set(elements.advice, '');
    elements.reasons.replaceChildren();
    set(elements.status, status);
    elements.start.hidden = false;
    elements.start.disabled = !deps.available || !shown?.final;
    elements.level.disabled = !deps.available;
    elements.stop.hidden = true;
    elements.send.hidden = false;
    elements.cancel.hidden = false;
    elements.send.disabled = false;
    elements.cancel.disabled = false;
    set(elements.intro, intro());
    // Focus on a button that was just hidden (Stop, Send) would be lost: move it to the start, or
    // to the status while the start waits (found in review round 3).
    const focused = document.activeElement;
    if (focused && elements.section.contains(focused) && focused.closest('[hidden]')) {
      (elements.start.disabled ? elements.status : elements.start).focus();
    } else if (focused === elements.status && !elements.start.disabled) {
      elements.start.focus();
    }
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
    elements.start.hidden = true;
    elements.level.disabled = true;
    elements.stop.hidden = false;
    elements.stop.focus();
    set(elements.status, 'Waiting for the on-device model…');
    // Not inside the search's time limit: a load can take minutes ("Stop" ends the wait).
    const ready = await settle(
      () => deps.modelReady(answerIn),
      () => false,
    );
    if (mine !== generation) return STOPPED;
    let names: string[] | undefined;
    if (ready) {
      set(elements.status, 'Looking for names on this device (Gemini Nano)…');
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

  async function prepare(): Promise<void> {
    if (!shown?.final || !deps.available || phase === 'preparing' || phase === 'sending') return;
    const { email, findings } = shown;
    const answerIn = language();
    // Fixed for this preview: changing it discards the preview (see the listener below).
    const chosen = level();
    reset();
    // "standard" keeps names: no model, no name search, nothing to wait for or stop.
    const found = chosen === 'high' ? await searchNames(email, answerIn) : [];
    if (found === STOPPED) return;
    const data = cloudData(email, findings ?? [], found, chosen);
    prepared = { data, language: answerIn };
    phase = 'preview';
    set(elements.removed, removedSummary(data.removed));
    set(elements.data, data.json);
    elements.stop.hidden = true;
    elements.level.disabled = false;
    elements.preview.hidden = false;
    set(elements.status, data.namesChecked ? PREVIEW_STATUS[chosen] : NAMES_MAY_REMAIN);
    elements.data.focus();
  }

  function showResult(result: AiCheckResult, findings: Finding[] | undefined, email: Email): void {
    phase = 'done';
    elements.stop.hidden = true;
    elements.start.hidden = false;
    elements.level.disabled = false;
    if (!result.ok) {
      set(
        elements.status,
        result.reason === 'stopped'
          ? 'The deep check was stopped. The data shown may already have reached the cloud.'
          : result.reason === 'unreadable-answer'
            ? 'The cloud answer could not be read. The on-device and rule checks still apply.'
            : `The deep check failed (${result.detail ?? 'unknown error'}). The on-device and rule checks still apply.`,
      );
      elements.start.focus();
      return;
    }
    const { verdict } = result;
    const judged = judge(verdict, findings, email, 'the cloud AI');
    elements.result.dataset.risk = judged.overall;
    elements.result.hidden = false;
    set(elements.overall, `Deep check: ${judged.line}`);
    set(elements.note, `${CLOUD_NOTE} ${(result.durationMs / 1000).toFixed(1)} s.`);
    elements.reasons.replaceChildren(
      ...verdict.reasons.map((reason) => {
        const item = document.createElement('li');
        item.textContent = reason;
        return item;
      }),
    );
    set(elements.advice, judged.advice);
    set(elements.status, 'Sent: the data shown above, once.');
    elements.result.focus();
  }

  async function send(): Promise<void> {
    if (!shown || !prepared || phase !== 'preview') return;
    const { email, findings } = shown;
    const { data, language: answerIn } = prepared;
    const mine = generation;
    phase = 'sending';
    prepared = undefined;
    elements.level.disabled = true;
    // The data stays visible as the record of what was sent; it is sent only once.
    elements.send.hidden = true;
    elements.cancel.hidden = true;
    elements.stop.hidden = false;
    elements.stop.focus();
    set(elements.status, 'Deep check running in the cloud…');
    const controller = new AbortController();
    stop = controller;
    const answer = await bounded(
      () => deps.run(buildCloudPrompt(data.json, answerIn), controller.signal),
      controller,
      cloudLimitMs,
      (error): AiCheckResult =>
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
    const result: AiCheckResult =
      controller.signal.reason === TIME_LIMIT && !answer.ok
        ? { ok: false, reason: 'failed', detail: `no answer within ${cloudLimitMs / 1000} s` }
        : answer;
    showResult(result, findings, email);
  }

  elements.start.addEventListener('click', () => void prepare());
  elements.send.addEventListener('click', () => void send());
  elements.level.addEventListener('change', () => {
    deps.saveLevel?.(level());
    // The preview must show exactly what goes: data prepared at the other level is discarded.
    if (phase === 'preview') {
      reset('The privacy level changed, so the prepared data was discarded. Nothing was sent.');
    } else if (phase === 'done') {
      // The result stays readable; the data above was sent at the level chosen before.
      set(
        elements.status,
        'The new privacy level applies to the next deep check. The data above was sent at the previous level.',
      );
    }
  });
  elements.cancel.addEventListener('click', () => {
    if (phase !== 'preview') return;
    reset('Nothing was sent.');
    elements.start.focus();
  });
  elements.stop.addEventListener('click', () => {
    if (phase === 'preparing') {
      reset('Stopped. Nothing was sent.');
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
