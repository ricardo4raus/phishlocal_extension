/*
 * The cloud "deep check" in the side panel. Nothing goes to the cloud on its own:
 *
 * 1. The user asks for it ("Prepare a deep check").
 * 2. On the device, Gemini Nano looks for names, and the privacy filter builds the data
 *    (`cloudData()`): no full links, addresses, numbers, IBANs or names, no raw headers.
 * 3. The panel shows exactly that data and what was removed.
 * 4. Only "Send to the cloud" sends it, once. Another email, or closing the panel, stops it.
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
import { overallRisk, RISKS, ruleRisk, type Risk } from '../ai/verdict';
import type { Email } from '../email';
import { type CloudData, cloudData, nameSearchText, type Removed } from '../privacy/redact';
import type { Finding } from '../rules';
import { ADVICE, LABEL, STOP_GRACE_MS } from './ai-view';

/** How long Gemini Nano may look for names before the data is built without its list. */
export const NAMES_TIMEOUT_MS = 20_000;

/**
 * How long the panel waits for the cloud. The request has its own limit of 30 s
 * (`CLOUD_TIMEOUT_MS`); this one also bounds a request that does not keep it.
 */
export const CLOUD_LIMIT_MS = 40_000;

/** The reason a run is stopped when it reaches its time limit. */
const TIME_LIMIT = 'time limit';

export interface DeepCheckElements {
  section: HTMLElement;
  intro: HTMLElement;
  start: HTMLButtonElement;
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
  /** Gemini Nano, on the device: the names of people in `text`, or undefined if it could not look. */
  findNames: (text: string, language: string, signal: AbortSignal) => Promise<string[] | undefined>;
  /** Sends one prompt to the cloud. Called only after the user agreed to the data in it. */
  run: (prompt: string, signal: AbortSignal) => Promise<AiCheckResult>;
  namesTimeoutMs?: number;
}

export interface DeepCheck {
  /** An email is shown with its rule findings (`undefined` if the rules failed). */
  shown(email: Email, findings: Finding[] | undefined): void;
  /** No email is shown any more. */
  hidden(): void;
}

const CLOUD_NOTE = 'Cloud (Gemini via Firebase AI Logic). AI can be wrong.';

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
  /** Same email and findings give the same key: Gmail shows an email several times. */
  key: string;
}

export function createDeepCheck(elements: DeepCheckElements, deps: DeepCheckDeps): DeepCheck {
  const namesTimeoutMs = deps.namesTimeoutMs ?? NAMES_TIMEOUT_MS;
  let shown: Shown | undefined;
  /** The data shown for consent; only this is ever sent. */
  let prepared: { data: CloudData; language: string } | undefined;
  /** Stops the name search or the cloud request in progress. */
  let stop: AbortController | undefined;
  /** Changes whenever the email changes or the user cancels: late results are dropped. */
  let generation = 0;

  const language = (): string => answerLanguage(deps.uiLanguage());

  /** Back to the start for the shown email: no preview, no result, nothing running. */
  function reset(): void {
    generation++;
    stop?.abort();
    stop = undefined;
    prepared = undefined;
    elements.preview.hidden = true;
    elements.result.hidden = true;
    delete elements.result.dataset.risk;
    set(elements.removed, '');
    set(elements.data, '');
    set(elements.status, '');
    set(elements.overall, '');
    set(elements.note, '');
    set(elements.advice, '');
    elements.reasons.replaceChildren();
    elements.start.hidden = false;
    elements.start.disabled = !deps.available;
    elements.send.hidden = false;
    elements.cancel.hidden = false;
    elements.send.disabled = false;
    elements.cancel.disabled = false;
    const name = AI_LANGUAGES[language()] ?? 'English';
    set(
      elements.intro,
      !deps.available
        ? 'Not available in this build: the cloud needs App Check, which only the development build has for now.'
        : EXPERIMENTAL_LANGUAGES.has(language())
          ? `Recommended: on-device answers in ${name} are experimental. A larger AI model in the cloud checks this email again. Nothing is sent before you have seen the data and agreed.`
          : 'Optional: a larger AI model in the cloud checks this email again. Nothing is sent before you have seen the data and agreed.',
    );
  }

  async function prepare(): Promise<void> {
    if (!shown || !deps.available) return;
    const { email, findings } = shown;
    const answerIn = language();
    reset();
    const mine = generation;
    elements.start.hidden = true;
    set(elements.status, 'Looking for names on this device (Gemini Nano)…');
    const controller = new AbortController();
    stop = controller;
    const names = await bounded(
      () => deps.findNames(nameSearchText(email), answerIn, controller.signal),
      controller,
      namesTimeoutMs,
      () => undefined,
    );
    if (mine !== generation) return;
    stop = undefined;
    // A search stopped by the time limit may still answer: its list is not trusted to be complete.
    const found = controller.signal.aborted ? undefined : names;
    const data = cloudData(email, findings ?? [], found);
    prepared = { data, language: answerIn };
    set(
      elements.removed,
      data.namesChecked
        ? removedSummary(data.removed)
        : `${removedSummary(data.removed)} Gemini Nano could not look for names on this device, so names may remain: read the data before you send it.`,
    );
    set(elements.data, data.json);
    elements.preview.hidden = false;
    set(elements.status, 'This is everything that will be sent, besides our fixed instructions.');
  }

  function showResult(result: AiCheckResult, findings: Finding[] | undefined, email: Email): void {
    if (!result.ok) {
      set(
        elements.status,
        result.reason === 'stopped'
          ? 'The deep check was stopped.'
          : result.reason === 'unreadable-answer'
            ? 'The cloud answer could not be read. The checks above still apply.'
            : `The deep check failed (${result.detail ?? 'unknown error'}). The checks above still apply.`,
      );
      elements.start.hidden = false;
      return;
    }
    const rules: Risk = findings ? ruleRisk(findings) : 'suspicious';
    const { verdict } = result;
    const confirmed = email.headers?.auth?.dmarc === 'pass';
    const overall = overallRisk(verdict.risk, rules, { senderConfirmed: confirmed });
    const stricter = overall !== verdict.risk;
    const onlyNotes = confirmed && RISKS.indexOf(verdict.risk) > RISKS.indexOf(overall);
    elements.result.dataset.risk = overall;
    elements.result.hidden = false;
    set(
      elements.overall,
      onlyNotes
        ? `Deep check: ${LABEL[overall]} (sender confirmed, rule checks found nothing; AI notes below)`
        : stricter
          ? `Deep check: ${LABEL[overall]} (rule checks; the cloud AI said: ${LABEL[verdict.risk].toLowerCase()})`
          : `Deep check: ${LABEL[overall]}`,
    );
    set(elements.note, `${CLOUD_NOTE} ${(result.durationMs / 1000).toFixed(1)} s.`);
    elements.reasons.replaceChildren(
      ...verdict.reasons.map((reason) => {
        const item = document.createElement('li');
        item.textContent = reason;
        return item;
      }),
    );
    set(elements.advice, stricter || !verdict.advice ? ADVICE[overall] : verdict.advice);
    set(elements.status, 'Sent: the data shown above, once.');
    elements.start.hidden = false;
  }

  async function send(): Promise<void> {
    if (!shown || !prepared || stop) return;
    const { email, findings } = shown;
    const { data, language: answerIn } = prepared;
    const mine = generation;
    elements.send.disabled = true;
    elements.cancel.disabled = true;
    set(elements.status, 'Deep check running in the cloud…');
    const controller = new AbortController();
    stop = controller;
    const answer = await bounded(
      () => deps.run(buildCloudPrompt(data.json, answerIn), controller.signal),
      controller,
      CLOUD_LIMIT_MS,
      (error): AiCheckResult => ({
        ok: false,
        reason: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
    if (mine !== generation) return;
    const result: AiCheckResult =
      controller.signal.reason === TIME_LIMIT && !answer.ok
        ? { ok: false, reason: 'failed', detail: `no answer within ${CLOUD_LIMIT_MS / 1000} s` }
        : answer;
    stop = undefined;
    prepared = undefined;
    // The data stays visible as the record of what was sent; it is sent only once.
    elements.send.hidden = true;
    elements.cancel.hidden = true;
    showResult(result, findings, email);
  }

  function cancel(): void {
    if (!shown || elements.cancel.disabled) return;
    reset();
    set(elements.status, 'Nothing was sent.');
  }

  elements.start.addEventListener('click', () => void prepare());
  elements.send.addEventListener('click', () => void send());
  elements.cancel.addEventListener('click', cancel);

  return {
    shown(email, findings) {
      const key = JSON.stringify([email, findings ?? null]);
      if (shown?.key === key) return;
      shown = { email, findings, key };
      elements.section.hidden = false;
      reset();
    },
    hidden() {
      shown = undefined;
      reset();
      elements.section.hidden = true;
    },
  };
}
