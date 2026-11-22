/*
 * The AI check in the side panel: when it runs, and how its answer is shown next to the rules.
 *
 * - One run at a time (Gemini Nano works on one prompt at a time). While one runs, only the
 *   newest email waits; results for an email that is no longer shown are dropped.
 * - A Gmail email first appears without headers; the AI waits for them, but at most a few seconds.
 * - The overall verdict is the higher of AI and rules. When the rules are stricter, our own advice
 *   replaces the AI's, so an injected "this is safe, log in here" cannot reach the user.
 * - What is shown follows docs/ui-design.md: tier 1 is the verdict word, one line and the advice;
 *   the footer says where the check ran; how the AI and the rules were combined, errors and timing
 *   are tier 3 (`detail`, inside "Email details").
 */
import type { AiCheckResult } from '../ai';
import { answerLanguage, buildUserPrompt, EXPERIMENTAL_LANGUAGES, promptData } from '../ai/prompt';
import { type AiVerdict, overallRisk, type Risk, RISKS, ruleRisk } from '../ai/verdict';
import type { Email } from '../email';
import type { Finding } from '../rules';
import { localDetail, m } from '../i18n';
import { en } from '../i18n/en';
import { clock, seconds } from './ui';

/** How long the AI waits for a Gmail email's headers before it runs without them. */
export const HEADERS_WAIT_MS = 3_000;

/** The band's states: the three risks, plus "still checking" and "the AI did not run". */
export type BandState = Risk | 'pending' | 'unchecked';

export interface AiElements {
  /** The verdict band; its `data-risk` sets the colour and symbol. */
  verdict: HTMLElement;
  /** The verdict word (a live region). */
  overall: HTMLElement;
  /** One line under the word: what it means, or what the check is doing right now. */
  status: HTMLElement;
  reasons: HTMLUListElement;
  /** What to do. */
  advice: HTMLElement;
  /** Footer: where the email was checked. */
  source: HTMLElement;
  /** Footer: how long the check took. */
  time: HTMLElement;
  /** Stops the running check of the shown email. */
  stop: HTMLButtonElement;
  /** Tier 3, in "Email details": how the AI and the basic checks were combined, errors, timing. */
  detail: HTMLElement;
}

/** The verdict words (tier 1). */
export const WORD: Record<BandState, string> = m.verdict.word;

/** The line under the verdict word: hedged, never "this is phishing" or "this is safe". */
export const LINE: Record<Exclude<BandState, 'pending'>, string> = m.verdict.line;

/** Our own advice, used whenever the rules are stricter than the AI, or the AI did not run. */
export const ADVICE: Record<Exclude<BandState, 'pending'>, string> = m.verdict.advice;

/** The footer's source line. */
export const SOURCE = {
  device: m.verdict.sourceDevice,
  rulesOnly: m.verdict.sourceRulesOnly,
} as const;

/** Percent-decoding that never throws: a link like `mailto:%E0` is attacker-written. */
const decode = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/** The email's own addresses (sender, Reply-To): the AI may name them in its reasons. */
const ownAddresses = (email: Email): ReadonlySet<string> =>
  new Set(
    [
      email.sender.address,
      ...(email.headers?.replyTo.map((box) => box.address) ?? []),
      // mailto: links of the email itself.
      ...email.links.flatMap((link) =>
        /^mailto:/i.test(link.href) ? [decode(link.href.slice(7).split('?')[0] ?? '')] : [],
      ),
    ]
      .filter((address) => address !== '')
      .map((address) => address.toLowerCase()),
  );

/** The sender's domain is confirmed by the receiving server (DMARC pass). */
const senderConfirmed = (email: Email): boolean => email.headers?.auth?.dmarc === 'pass';

const set = (element: HTMLElement, text: string): void => {
  element.textContent = text;
};

/** The rules' risk; if the rules failed, at least "suspicious". */
const rulesRisk = (findings: Finding[] | undefined): Risk =>
  findings ? ruleRisk(findings) : 'suspicious';

/**
 * How an AI verdict (on the device or from the cloud) combines with the rules: the risk shown,
 * the advice, and how to explain the combination. `ai` names the AI ("the AI", "the cloud AI").
 * `line` is the old one-line form, still used by the deep check's result.
 */
export function judge(
  verdict: AiVerdict,
  findings: Finding[] | undefined,
  email: Email,
  ai: string,
): { overall: Risk; line: string; advice: string; detail: string } {
  const confirmed = senderConfirmed(email);
  const overall = overallRisk(verdict.risk, rulesRisk(findings), { senderConfirmed: confirmed });
  const stricter = overall !== verdict.risk;
  // The AI was more worried, but the sender is confirmed and the rules found nothing.
  const onlyNotes = confirmed && RISKS.indexOf(verdict.risk) > RISKS.indexOf(overall);
  const level = m.verdict.aiSaid[verdict.risk];
  const said = m.judge.said(ai, level);
  return {
    overall,
    line: onlyNotes
      ? m.judge.lineOnlyNotes(WORD[overall])
      : stricter
        ? m.judge.lineStricter(WORD[overall], ai, level)
        : WORD[overall],
    advice: stricter || !verdict.advice ? ADVICE[overall] : verdict.advice,
    detail: onlyNotes
      ? m.judge.detailOnlyNotes(said)
      : stricter
        ? m.judge.detailStricter(said)
        : '',
  };
}

export interface AiCheckDeps {
  /** Runs one check; `signal` stops it (in Chrome too), e.g. when its email is no longer shown. */
  run: (
    prompt: string,
    language: string,
    knownAddresses: ReadonlySet<string>,
    signal: AbortSignal,
  ) => Promise<AiCheckResult>;
  /** The panel's language (`language` in src/i18n), e.g. "de": the AI answers in it. */
  panelLanguage: () => string;
  /**
   * Waits until the on-device model is loaded (that can take minutes in a bad Chrome state) and
   * says whether it is ready. The run's time limit starts only after that.
   */
  modelReady: (language: string) => Promise<boolean>;
  headersWaitMs?: number;
  /**
   * A run that has not answered after this long is stopped and the queue moves on (settings'
   * `aiCheckTimeoutMs`).
   */
  runTimeoutMs: number;
}

export interface AiCheck {
  /**
   * An email is shown with its rule findings (`undefined` if the rules failed). `final` is false
   * while a Gmail email still waits for its headers.
   */
  shown(email: Email, findings: Finding[] | undefined, final: boolean): void;
  /** No email is shown any more. */
  hidden(): void;
  /** Checks the shown email again, e.g. once the model is downloaded. A known answer is reused. */
  recheck(): void;
}

interface Request {
  id: number;
  email: Email;
  findings: Finding[] | undefined;
  language: string;
  /**
   * Same email, findings, language and own addresses give the same key: one run serves them all.
   */
  key: string;
  /** When the request was queued or started (ms), for the waiting time shown. */
  since: number;
  /** While running: still waiting for the model to load, or already asking it. */
  phase?: 'model' | 'run';
  /** Stops the run while it asks the model. */
  stop?: AbortController;
  /** The user stopped the check while it waited for the model. */
  cancelled?: boolean;
  /** 2 while the check runs a second time after a failure. */
  attempt?: number;
}

/**
 * Gmail shows an email several times within a moment (without headers, with headers, more
 * rendered). A check starts only once the shown email has not changed for this long, so no run is
 * wasted on a version that is replaced right away.
 */
export const STABLE_MS = 500;

/**
 * After a stop, how long a run gets to end before the queue moves on without it. A run that
 * follows its signal ends at once; this only bounds one that does not.
 */
export const STOP_GRACE_MS = 2_000;

/** How many recent AI answers are kept for emails shown again. */
export const MAX_REMEMBERED = 20;

/**
 * Waiting for the model longer than this means Chrome is really loading it; a loaded model is
 * ready in about 0 s. Shorter waits show "running", so the loading text does not flash on every
 * check.
 */
export const LOADING_HINT_MS = 1_000;

/**
 * Errors not worth a second try: the input is too large for Chrome (comes back the same), or the
 * run reached the time limit (a hung model would most likely hang again, and the second try's
 * wait for the model has no limit). A crash ends with an error of its own and is retried.
 */
const LASTING_ERROR = /too large|quota|^no answer within/i;

/**
 * Results worth one more try: the model may have crashed or answered badly once. Not an error
 * that would come back the same: a second try would only double the wait.
 */
const retryable = (result: AiCheckResult): boolean =>
  !result.ok &&
  (result.reason === 'unreadable-answer' ||
    (result.reason === 'failed' && !LASTING_ERROR.test(result.detail ?? '')));

/** Why the AI gave no answer, in one tier-3 sentence. */
function failureDetail(result: AiCheckResult & { ok: false }, attempt: number | undefined): string {
  // The two tries may have failed differently: name only the last reason.
  const again = attempt === 2;
  switch (result.reason) {
    case 'no-model':
      return m.aiCheck.noModel;
    case 'stopped':
      return m.aiCheck.stopped;
    case 'failed':
      return m.aiCheck.failed(again, localDetail(result.detail ?? m.aiCheck.unknownError));
    default:
      return m.aiCheck.unreadable(again);
  }
}

export function createAiCheck(elements: AiElements, deps: AiCheckDeps): AiCheck {
  const waitMs = deps.headersWaitMs ?? HEADERS_WAIT_MS;
  const { runTimeoutMs } = deps;
  /** Id of the email shown now; results for other ids are dropped. */
  let shownId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The run in progress, and the newest request waiting for it to finish. */
  let current: Request | undefined;
  let waiting: Request | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  /**
   * Recent AI answers by request key. An email shown again (Gmail renders it anew, or the user
   * goes back to it) gets its answer at once instead of a new run and a grey light. Only in
   * memory: closing the panel forgets them.
   */
  const answers = new Map<string, AiCheckResult & { ok: true }>();

  const remember = (key: string, result: AiCheckResult): void => {
    if (!result.ok) return; // A failed run is tried again next time.
    answers.delete(key);
    answers.set(key, result);
    const oldest = answers.keys().next();
    if (answers.size > MAX_REMEMBERED && !oldest.done) answers.delete(oldest.value);
  };

  /** Shows how long the shown email's check has been running or waiting. */
  const tick = (): void => {
    const now = performance.now();
    if (current?.id === shownId && !current.cancelled) {
      const elapsed = now - current.since;
      const second = current.attempt === 2;
      set(
        elements.status,
        current.phase === 'model' && elapsed >= LOADING_HINT_MS
          ? m.aiCheck.loading(second)
          : m.aiCheck.running(second),
      );
      set(elements.time, clock(elapsed));
      elements.stop.hidden = false;
    } else if (waiting?.id === shownId && current) {
      set(elements.status, m.aiCheck.waitingPrevious);
      set(elements.time, clock(now - waiting.since));
      elements.stop.hidden = false;
    }
    if (!current && !waiting) {
      clearInterval(ticker);
      ticker = undefined;
    }
  };

  const startTicker = (): void => {
    tick();
    ticker ??= setInterval(tick, 1_000);
  };

  const setState = (state: BandState): void => {
    elements.verdict.dataset.risk = state;
  };

  /**
   * The band before the AI has answered. While the AI check is still to come, "no red flags" is
   * grey ("Checking…"): the AI may still raise it, and the user should not act on it yet.
   */
  function showPending(request: Request, line: string): void {
    const risk = rulesRisk(request.findings);
    elements.verdict.hidden = false;
    setState(risk === 'safe' ? 'pending' : risk);
    set(elements.overall, WORD[risk === 'safe' ? 'pending' : risk]);
    set(elements.status, line);
    elements.reasons.replaceChildren();
    set(elements.advice, risk === 'safe' ? '' : ADVICE[risk]);
    set(elements.source, '');
    set(elements.time, '');
    elements.stop.hidden = false;
    set(elements.detail, '');
  }

  /**
   * The AI gave no answer (failed, stopped, not available): the rules' verdict stands, but a
   * green light is not shown. "No red flags" becomes the grey "unchecked" state, and the footer
   * says that only the basic checks ran.
   */
  function showUnchecked(request: Request, detail: string): void {
    const risk = rulesRisk(request.findings);
    const state: BandState = risk === 'safe' ? 'unchecked' : risk;
    elements.verdict.hidden = false;
    setState(state);
    set(elements.overall, WORD[state]);
    set(elements.status, LINE[state]);
    elements.reasons.replaceChildren();
    set(elements.advice, ADVICE[state]);
    set(elements.source, SOURCE.rulesOnly);
    set(elements.time, '');
    elements.stop.hidden = true;
    set(elements.detail, detail);
  }

  function showResult(request: Request, result: AiCheckResult): void {
    if (!result.ok) {
      showUnchecked(request, failureDetail(result, request.attempt));
      return;
    }
    const { verdict } = result;
    const judged = judge(verdict, request.findings, request.email, m.judge.theAi);
    elements.verdict.hidden = false;
    setState(judged.overall);
    set(elements.overall, WORD[judged.overall]);
    set(elements.status, LINE[judged.overall]);
    elements.reasons.replaceChildren(
      ...verdict.reasons.map((reason) => {
        const item = document.createElement('li');
        item.textContent = reason;
        return item;
      }),
    );
    set(elements.advice, judged.advice);
    set(elements.source, SOURCE.device);
    set(elements.time, m.verdict.doneIn(seconds(result.durationMs)));
    elements.stop.hidden = true;
    const experimental = EXPERIMENTAL_LANGUAGES.has(request.language)
      ? ` ${m.aiCheck.experimental}`
      : '';
    set(
      elements.detail,
      [judged.detail, `${m.aiCheck.note} ${seconds(result.durationMs)}.${experimental}`]
        .filter((part) => part !== '')
        .join(' '),
    );
  }

  /**
   * Runs one request and never throws. After the run's time limit, or when its email is no longer
   * shown, it is stopped (in Chrome too, so Gemini Nano is free for the next one).
   */
  async function runOnce(request: Request): Promise<AiCheckResult> {
    const stop = new AbortController();
    request.stop = stop;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      stop.abort();
    }, runTimeoutMs);
    // A run that ignores its signal still lets the queue move on.
    const abandoned = new Promise<AiCheckResult>((resolve) => {
      stop.signal.addEventListener(
        'abort',
        () => setTimeout(() => resolve({ ok: false, reason: 'stopped' }), STOP_GRACE_MS),
        { once: true },
      );
    });
    try {
      const prompt = buildUserPrompt(request.email, request.findings ?? [], request.language);
      const result = await Promise.race([
        deps.run(prompt, request.language, ownAddresses(request.email), stop.signal),
        abandoned,
      ]);
      if (timedOut && !result.ok) {
        // How far the model had come tells a hung model from one that does not stop writing.
        const progress = result.reason === 'stopped' && result.detail ? `; ${result.detail}` : '';
        return {
          ok: false,
          reason: 'failed',
          detail: `${en.errors.noAnswerWithin(String(Math.round(runTimeoutMs / 1000)))}${progress}`,
        };
      }
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: 'failed', detail };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Stops the running check unless it is the one for `key` (its email is still wanted). */
  const stopRunning = (key?: string): void => {
    if (current && current.key !== key) {
      current.cancelled = true;
      current.stop?.abort();
    }
  };

  /**
   * One try: waits for the model (a load does not count against the run's time limit; after a
   * crash, Chrome loads it again here), then runs the check.
   */
  async function tryOnce(request: Request): Promise<AiCheckResult> {
    // A second try starts without the first try's (possibly stopped) controller.
    request.stop = undefined;
    request.phase = 'model';
    request.since = performance.now();
    startTicker();
    const ready = await deps.modelReady(request.language).catch(() => false);
    // Another email was opened while the model loaded, or the user stopped the check: do not
    // spend the model on this one.
    if (request.id !== shownId || request.cancelled) return { ok: false, reason: 'stopped' };
    if (!ready) return { ok: false, reason: 'no-model' };
    request.phase = 'run';
    request.since = performance.now();
    tick();
    return runOnce(request);
  }

  async function drain(): Promise<void> {
    if (current) return;
    for (let request = waiting; request; request = waiting) {
      waiting = undefined;
      if (request.id !== shownId) continue;
      current = { ...request, attempt: 1 };
      let result = await tryOnce(current);
      // One more try for a run that failed (e.g. Chrome's model crashed) while its email is shown.
      if (retryable(result) && current.id === shownId && !current.cancelled) {
        current.attempt = 2;
        const second = await tryOnce(current);
        if (!second.ok && second.reason === 'no-model') {
          // The model could not be loaded for the second try: the first failure says more.
          current.attempt = 1;
        } else {
          result = second;
        }
      }
      const finished = current;
      current = undefined;
      remember(finished.key, result);
      // A run the user stopped was shown as "unchecked" at the click; its late end changes nothing.
      if (finished.id === shownId && !(finished.cancelled && !result.ok)) {
        showResult(finished, result);
      }
    }
    tick();
  }

  /**
   * The running check is for the same email, findings and language, and not stopped: its answer
   * serves `request` too. A stopped run (its email was left, then shown again before the run
   * ended) only says "stopped", so the email needs a fresh run.
   */
  const adoptable = (request: Request): boolean =>
    current?.key === request.key && !current.cancelled && !current.stop?.signal.aborted;

  /**
   * The same check is already running (e.g. Gmail showed the email again): its answer serves
   * `request`. The running check takes over the new email and findings, which the key may not
   * tell apart: rules that failed this time (`undefined`) give the same prompt as no findings,
   * but must keep the verdict at "suspicious" at least (found by the monkey test).
   */
  const adopt = (request: Request): boolean => {
    if (!current || !adoptable(request)) return false;
    current.id = request.id;
    current.email = request.email;
    current.findings = request.findings;
    startTicker();
    return true;
  };

  const enqueue = (request: Request): void => {
    if (adopt(request)) return;
    // The running check is for an email that is no longer shown: free the model.
    stopRunning(request.key);
    waiting = request;
    startTicker();
    void drain();
  };

  /** The email shown now, for `recheck()`. */
  let last: { email: Email; findings: Finding[] | undefined; final: boolean } | undefined;

  function shown(email: Email, findings: Finding[] | undefined, final: boolean): void {
    clearTimeout(timer);
    last = { email, findings, final };
    const language = answerLanguage(deps.panelLanguage());
    const request: Request = {
      id: ++shownId,
      email,
      findings,
      language,
      // The own addresses too: they decide which addresses the answer may name, and the prompt
      // leaves Reply-To out, so two emails with the same prompt can differ in them.
      key: [
        language,
        JSON.stringify(promptData(email, findings ?? [])),
        [...ownAddresses(email)].toSorted().join(' '),
      ].join('|'),
      since: performance.now(),
    };
    const known = answers.get(request.key);
    if (known) {
      stopRunning(request.key);
      showResult(request, known);
      return;
    }
    showPending(request, final ? m.aiCheck.starting : m.aiCheck.waitingHeaders);
    // The same email is already being checked: use that run's answer.
    if (adopt(request)) return;
    timer = setTimeout(() => enqueue(request), final ? STABLE_MS : waitMs);
  }

  /**
   * The user stops the check of the shown email: the rules' verdict shows at once, as
   * "unchecked", whatever the run is doing (waiting behind another email, waiting for the model,
   * asking the model, or not started yet). The Stop button goes away, so the focus moves to the
   * verdict word.
   */
  elements.stop.addEventListener('click', () => {
    clearTimeout(timer);
    const stopped = failureDetail({ ok: false, reason: 'stopped' }, undefined);
    const hadFocus = document.activeElement === elements.stop;
    if (waiting?.id === shownId) {
      const request = waiting;
      waiting = undefined;
      showUnchecked(request, stopped);
    } else if (current?.id === shownId) {
      current.cancelled = true;
      current.stop?.abort();
      showUnchecked(current, stopped);
    } else if (last) {
      // Nothing is running yet (the stable delay): show the rules' verdict instead.
      showUnchecked(
        {
          id: shownId,
          email: last.email,
          findings: last.findings,
          language: '',
          key: '',
          since: 0,
        },
        stopped,
      );
    }
    if (hadFocus) elements.overall.focus();
  });

  return {
    shown,
    recheck() {
      if (last) shown(last.email, last.findings, last.final);
    },
    hidden() {
      clearTimeout(timer);
      last = undefined;
      shownId++;
      waiting = undefined;
      stopRunning();
      elements.verdict.hidden = true;
      delete elements.verdict.dataset.risk;
      for (const element of [
        elements.overall,
        elements.status,
        elements.advice,
        elements.source,
        elements.time,
        elements.detail,
      ]) {
        set(element, '');
      }
      elements.reasons.replaceChildren();
      elements.stop.hidden = true;
    },
  };
}
