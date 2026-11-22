/*
 * The cloud "deep check" in the side panel. Nothing goes to the cloud on its own:
 *
 * 1. The user opens it ("Deep check in the cloud…"): the consent card appears in place of the
 *    red flags and links; the strip and the verdict stay.
 * 2. On the device, the privacy filter builds the data (`cloudData()`) at the chosen privacy
 *    level: no full links, addresses, numbers or IBANs, no raw headers; at level High, Gemini
 *    Nano first looks for names, and they go too. Changing the level builds the data again.
 * 3. The card shows what was removed (chips), what is never sent, and, one click away, exactly
 *    the data that goes.
 * 4. Only "Send to the cloud" sends it, once. Another email, closing the panel, Cancel, Back or
 *    Stop end it.
 *
 * The cloud's answer is read as strictly as the on-device one, and the rules stay its lower limit.
 * What is shown follows docs/ui-design.md ("The consent section").
 */
import type { CloudCheckResult } from '../ai';
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
import { HEADERS_WAIT_MS, judge, LINE, STOP_GRACE_MS, WORD } from './ai-view';
import { countElapsed, el, seconds } from './ui';

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
  /** The offer: the button and, under it, one line only when recommended or unavailable. */
  start: HTMLButtonElement;
  intro: HTMLElement;
  /** The consent card. */
  consent: HTMLElement;
  back: HTMLButtonElement;
  /** The privacy level: radio buttons named `deep-check-level`, one per PrivacyLevel. */
  levels: HTMLFieldSetElement;
  preview: HTMLElement;
  /** What was removed, as chips. */
  removed: HTMLElement;
  /** "Some names may still be in the text" (shown when the name search could not finish). */
  warning: HTMLElement;
  /** Opens the exact data ("Show what will be sent"). */
  show: HTMLButtonElement;
  dataPanel: HTMLElement;
  data: HTMLElement;
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
  /** The panel's language (`PANEL_LANGUAGE`), e.g. "en": the AI answers in it. */
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

const NOT_AVAILABLE = 'Not available in this build.';

const isPrivacyLevel = (value: string | undefined): value is PrivacyLevel =>
  PRIVACY_LEVELS.some((level) => level === value);

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** The chips: what was removed on this device, and what was kept on purpose. */
export function removedChips(removed: Removed, level: PrivacyLevel): string[] {
  const chips = [
    removed.names > 0 && plural(removed.names, 'name', 'names'),
    removed.emails > 0 && plural(removed.emails, 'email address', 'email addresses'),
    removed.numbers > 0 && plural(removed.numbers, 'number', 'numbers'),
    removed.ibans > 0 && plural(removed.ibans, 'IBAN', 'IBANs'),
    removed.links > 0 && plural(removed.links, 'link path', 'link paths'),
  ].filter((chip) => chip !== false);
  if (chips.length === 0) chips.push('No personal data found');
  if (level === 'standard') chips.push('Names kept');
  return chips;
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

  /** The line under the offer button: only when the deep check is recommended or unavailable. */
  function intro(): string {
    if (!deps.available) return NOT_AVAILABLE;
    if (shown && !shown.final) return 'Waiting for the sender checks…';
    if (EXPERIMENTAL_LANGUAGES.has(language())) {
      return `Recommended: on-device answers in ${AI_LANGUAGES[language()] ?? 'English'} are experimental.`;
    }
    if (deps.aiUnchecked?.()) return 'Recommended: the on-device AI did not check this email.';
    return '';
  }

  /** The offer button: filled when recommended, disabled when the cloud cannot be reached. */
  function showOffer(): void {
    const text = intro();
    set(elements.intro, text);
    elements.start.disabled = !deps.available || !shown?.final;
    elements.start.classList.toggle(
      'btn--primary',
      deps.available && text.startsWith('Recommended'),
    );
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

  function clearPreview(): void {
    prepared = undefined;
    elements.preview.hidden = true;
    elements.removed.replaceChildren();
    set(elements.data, '');
    elements.warning.hidden = true;
    elements.dataPanel.hidden = true;
    elements.show.setAttribute('aria-expanded', 'false');
    elements.send.hidden = false;
    elements.cancel.hidden = false;
  }

  /** Back to the start for the shown email: no preview, no result, nothing running. */
  function reset(status = '', { keepResult = false, close = true } = {}): void {
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
    setLevelsDisabled(!deps.available);
    if (close) setConsent(false);
    showOffer();
    // Focus on a button that was just hidden (Stop, Send) would be lost: move it to the start, or
    // to the status while the start waits (found in review round 3).
    const focused = document.activeElement;
    if (focused && elements.section.contains(focused) && focused.closest('[hidden]')) {
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
    running('Waiting for the on-device AI…');
    // Not inside the search's time limit: a load can take minutes ("Stop" ends the wait).
    const ready = await settle(
      () => deps.modelReady(answerIn),
      () => false,
    );
    if (mine !== generation) return STOPPED;
    let names: string[] | undefined;
    if (ready) {
      running('Looking for names on this device…');
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
      elements.removed.replaceChildren(
        ...removedChips(data.removed, chosen).map((chip) => el('span', 'chip chip--plain', chip)),
      );
      set(elements.data, data.json);
      elements.warning.hidden = data.namesChecked;
      elements.preview.hidden = false;
      set(elements.status, '');
      // Never on Send: a second Enter must not send data the user has not looked at.
      if (!elements.levels.contains(document.activeElement)) elements.preview.focus();
    } catch (error) {
      console.error('PhishLocal: the deep check could not prepare its data', error);
      reset('The deep check could not prepare its data. Nothing was sent.');
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
          ? 'The deep check was stopped. The data shown may already have reached the cloud; you can send it again.'
          : result.reason === 'limit'
            ? "The deep check has reached today's limit. Nothing was sent; the result above still applies."
            : result.reason === 'unreadable-answer'
              ? 'The cloud answer could not be read. The result above still applies; you can send the data again.'
              : 'The deep check did not work. The result above still applies; you can send the data again.',
      );
      elements.status.classList.add('status--error');
      // What went wrong, in the cloud's or the network's words: tier 3.
      set(
        elements.detail,
        result.reason === 'failed'
          ? `The cloud request failed: ${result.detail ?? 'unknown error'}.`
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
    const judged = judge(verdict, findings, email, 'the cloud AI');
    elements.result.dataset.risk = judged.overall;
    elements.result.hidden = false;
    set(elements.overall, `Deep check: ${WORD[judged.overall]}`);
    set(elements.line, LINE[judged.overall]);
    elements.reasons.replaceChildren(
      ...verdict.reasons.map((reason) => {
        const item = document.createElement('li');
        item.textContent = reason;
        return item;
      }),
    );
    set(elements.advice, judged.advice);
    set(elements.source, 'Checked in the cloud');
    set(elements.time, `Done in ${seconds(result.durationMs)}`);
    set(
      elements.detail,
      [
        judged.detail,
        `Cloud (Gemini via Firebase AI Logic). AI can be wrong. ${seconds(result.durationMs)}.`,
      ]
        .filter((part) => part !== '')
        .join(' '),
    );
    set(elements.status, 'Sent once, for this check only.');
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
    running('Checking in the cloud…');
    elements.stop.focus();
    const controller = new AbortController();
    stop = controller;
    const answer = await bounded(
      () => deps.run(buildCloudPrompt(data.json, answerIn), controller.signal),
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
        ? { ok: false, reason: 'failed', detail: `no answer within ${cloudLimitMs / 1000} s` }
        : answer;
    try {
      showResult(result, findings, email);
    } catch (error) {
      console.error('PhishLocal: the deep check could not show its result', error);
      reset('The deep check result could not be shown.', { keepResult: false, close: false });
      elements.status.classList.add('status--error');
    }
  }

  elements.start.addEventListener('click', () => void prepare());
  elements.send.addEventListener('click', () => void send());
  elements.show.addEventListener('click', () => {
    const open = elements.dataPanel.hidden;
    elements.dataPanel.hidden = !open;
    elements.show.setAttribute('aria-expanded', String(open));
    if (open) elements.data.focus();
  });
  elements.levels.addEventListener('change', () => {
    deps.saveLevel?.(level());
    // The preview must show exactly what goes: the data is built again at the new level.
    if (phase === 'preview') {
      void prepare();
    } else if (phase === 'done') {
      // The result stays readable; the data above was sent at the level chosen before.
      set(
        elements.status,
        'The new privacy level applies to the next deep check. The data above was sent at the previous level.',
      );
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
      reset('Nothing was sent.');
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
