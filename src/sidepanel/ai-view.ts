/*
 * The AI check in the side panel: when it runs, and how its answer is shown next to the rules.
 *
 * - One run at a time (Gemini Nano works on one prompt at a time). While one runs, only the
 *   newest email waits; results for an email that is no longer shown are dropped.
 * - A Gmail email first appears without headers; the AI waits for them, but at most a few seconds.
 * - The overall verdict is the higher of AI and rules. When the rules are stricter, our own advice
 *   replaces the AI's, so an injected "this is safe, log in here" cannot reach the user.
 */
import type { AiCheckResult } from '../ai';
import { answerLanguage, buildUserPrompt, EXPERIMENTAL_LANGUAGES, promptData } from '../ai/prompt';
import { overallRisk, type Risk, RISKS, ruleRisk } from '../ai/verdict';
import type { Email } from '../email';
import type { Finding } from '../rules';

/** How long the AI waits for a Gmail email's headers before it runs without them. */
export const HEADERS_WAIT_MS = 3_000;

export interface AiElements {
  /** The verdict block; its `data-risk` sets the traffic light's colour and symbol. */
  verdict: HTMLElement;
  overall: HTMLElement;
  status: HTMLElement;
  reasons: HTMLUListElement;
  advice: HTMLElement;
}

const LABEL: Record<Risk, string> = {
  safe: 'No signs of phishing',
  suspicious: 'Suspicious',
  dangerous: 'Dangerous',
};

/** Our own advice, used whenever the rules are stricter than the AI. */
const ADVICE: Record<Risk, string> = {
  safe: 'No signs of phishing found. Stay careful with unexpected requests.',
  suspicious:
    'Be careful: do not enter passwords or card details and do not pay. Check with the sender through a way you already know.',
  dangerous:
    'Do not click links, open attachments or reply. Delete the email or report it as phishing.',
};

const AI_NOTE = 'On-device (Gemini Nano). AI can be wrong.';

/** The email's own addresses (sender, Reply-To): the AI may name them in its reasons. */
const ownAddresses = (email: Email): ReadonlySet<string> =>
  new Set(
    [
      email.sender.address,
      ...(email.headers?.replyTo.map((box) => box.address) ?? []),
      // mailto: links of the email itself.
      ...email.links.flatMap((link) =>
        /^mailto:/i.test(link.href)
          ? [decodeURIComponent(link.href.slice(7).split('?')[0] ?? '')]
          : [],
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

export interface AiCheckDeps {
  /** Runs one check; `signal` stops it (in Chrome too), e.g. when its email is no longer shown. */
  run: (
    prompt: string,
    language: string,
    knownAddresses: ReadonlySet<string>,
    signal: AbortSignal,
  ) => Promise<AiCheckResult>;
  /** Chrome's UI language, e.g. "de-CH". */
  uiLanguage: () => string;
  /**
   * Waits until the on-device model is loaded (that can take minutes in a bad Chrome state) and
   * says whether it is ready. The run's time limit starts only after that.
   */
  modelReady: (language: string) => Promise<boolean>;
  headersWaitMs?: number;
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
  /** Same email, findings and language give the same key: one run serves them all. */
  key: string;
  /** When the request was queued or started (ms), for the waiting time shown. */
  since: number;
  /** While running: still waiting for the model to load, or already asking it. */
  phase?: 'model' | 'run';
  /** Stops the run while it asks the model. */
  stop?: AbortController;
  /** 2 while the check runs a second time after a failure. */
  attempt?: number;
}

/**
 * Gmail shows an email several times within a moment (without headers, with headers, more
 * rendered). A check starts only once the shown email has not changed for this long, so no run is
 * wasted on a version that is replaced right away.
 */
export const STABLE_MS = 500;

/** A run that has not answered after this long is stopped (the queue moves on). */
export const RUN_TIMEOUT_MS = 60_000;

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

/** Errors that come back the same on a second try (Chrome: the input is too large). */
const LASTING_ERROR = /too large|quota/i;

/**
 * Results worth one more try: the model may have crashed or answered badly once. Not an error
 * that would come back the same: a second try would only double the wait.
 */
const retryable = (result: AiCheckResult): boolean =>
  !result.ok &&
  (result.reason === 'unreadable-answer' ||
    (result.reason === 'failed' && !LASTING_ERROR.test(result.detail ?? '')));

const seconds = (ms: number): string => `${Math.round(ms / 1000)} s`;

export function createAiCheck(elements: AiElements, deps: AiCheckDeps): AiCheck {
  const waitMs = deps.headersWaitMs ?? HEADERS_WAIT_MS;
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
    if (current?.id === shownId) {
      const elapsed = now - current.since;
      const second = current.attempt === 2 ? ' (second try)' : '';
      // The rules failed (no findings): their result above says so; do not call them done.
      const rulesDone = current.findings ? 'Rule checks done. ' : '';
      set(
        elements.status,
        current.phase === 'model' && elapsed >= LOADING_HINT_MS
          ? `On-device model still loading${second}… ${seconds(elapsed)}. ${rulesDone}The AI ` +
              'result appears here by itself; the first load after Chrome starts can take several minutes.'
          : `AI check running on this device${second}… ${seconds(elapsed)}`,
      );
    } else if (waiting?.id === shownId && current) {
      set(
        elements.status,
        `AI check waits for the previous email's check to finish… ${seconds(now - waiting.since)}`,
      );
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

  /** `pending`: grey, while the AI answer is still to come. */
  const setRisk = (risk: Risk | 'pending'): void => {
    elements.verdict.dataset.risk = risk;
  };

  /**
   * The rules' verdict alone. While the AI check is still to come (`pending`), "no red flags" is
   * not shown as green: the AI may still raise it, and the user should not act on it yet.
   */
  /**
   * `aiFailed`: the AI check was meant to run and did not give an answer. The light still shows
   * the rules' verdict, but the verdict line says that only the rules checked the email.
   */
  function showRulesOnly(request: Request, note: string, pending = false, aiFailed = false): void {
    const risk = rulesRisk(request.findings);
    const notYet = pending && risk === 'safe';
    elements.verdict.hidden = false;
    setRisk(notYet ? 'pending' : risk);
    set(
      elements.overall,
      notYet
        ? 'Checking… (the rule checks found no red flags)'
        : aiFailed
          ? `${LABEL[risk]} (rule checks only: the AI check failed)`
          : `${LABEL[risk]} (rule checks)`,
    );
    set(elements.status, note);
    elements.status.classList.toggle('ai-failed', aiFailed);
    elements.reasons.replaceChildren();
    set(elements.advice, notYet ? '' : ADVICE[risk]);
  }

  function showResult(request: Request, result: AiCheckResult): void {
    elements.status.classList.remove('ai-failed');
    if (!result.ok) {
      // The two tries may have failed differently: name only the last reason.
      const again = request.attempt === 2 ? ' after a second try' : '';
      const note =
        result.reason === 'no-model'
          ? 'AI check not available: the on-device model is not ready. Rule checks only.'
          : result.reason === 'failed'
            ? `The AI check failed${again} (${result.detail ?? 'unknown error'}). The rule checks still apply.`
            : result.reason === 'stopped'
              ? 'The AI check was stopped. The rule checks still apply.'
              : `The AI answer could not be read${again}. The rule checks still apply.`;
      showRulesOnly(request, note, false, result.reason !== 'no-model');
      return;
    }
    const rules = rulesRisk(request.findings);
    const { verdict } = result;
    const confirmed = senderConfirmed(request.email);
    const overall = overallRisk(verdict.risk, rules, { senderConfirmed: confirmed });
    const stricter = overall !== verdict.risk;
    // The AI was more worried, but the sender is confirmed and the rules found nothing.
    const onlyNotes = confirmed && RISKS.indexOf(verdict.risk) > RISKS.indexOf(overall);
    elements.verdict.hidden = false;
    setRisk(overall);
    set(
      elements.overall,
      onlyNotes
        ? `${LABEL[overall]} (sender confirmed, rule checks found nothing; AI notes below)`
        : stricter
          ? `${LABEL[overall]} (rule checks; the AI said: ${LABEL[verdict.risk].toLowerCase()})`
          : LABEL[overall],
    );
    const note = EXPERIMENTAL_LANGUAGES.has(request.language)
      ? `${AI_NOTE} Answers in this language are experimental.`
      : AI_NOTE;
    set(elements.status, `${note} ${(result.durationMs / 1000).toFixed(1)} s.`);
    elements.reasons.replaceChildren(
      ...verdict.reasons.map((reason) => {
        const item = document.createElement('li');
        item.textContent = reason;
        return item;
      }),
    );
    set(elements.advice, stricter || !verdict.advice ? ADVICE[overall] : verdict.advice);
  }

  /**
   * Runs one request and never throws. After RUN_TIMEOUT_MS, or when its email is no longer
   * shown, it is stopped (in Chrome too, so Gemini Nano is free for the next one).
   */
  async function runOnce(request: Request): Promise<AiCheckResult> {
    const stop = new AbortController();
    request.stop = stop;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      stop.abort();
    }, RUN_TIMEOUT_MS);
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
          detail: `no answer within ${seconds(RUN_TIMEOUT_MS)}${progress}`,
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
    if (current && current.key !== key) current.stop?.abort();
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
    // Another email was opened while the model loaded: do not spend the model on this one.
    if (request.id !== shownId) return { ok: false, reason: 'stopped' };
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
      if (retryable(result) && current.id === shownId) {
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
      if (finished.id === shownId) showResult(finished, result);
    }
    tick();
  }

  /**
   * The running check is for the same email, findings and language, and not stopped: its answer
   * serves `request` too. A stopped run (its email was left, then shown again before the run
   * ended) only says "stopped", so the email needs a fresh run.
   */
  const adoptable = (request: Request): boolean =>
    current?.key === request.key && !current.stop?.signal.aborted;

  const enqueue = (request: Request): void => {
    // The same check is already running (e.g. Gmail showed the email again): use its answer.
    if (current && adoptable(request)) {
      current.id = request.id;
      startTicker();
      return;
    }
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
    const language = answerLanguage(deps.uiLanguage());
    const request: Request = {
      id: ++shownId,
      email,
      findings,
      language,
      key: `${language}|${JSON.stringify(promptData(email, findings ?? []))}`,
      since: performance.now(),
    };
    const known = answers.get(request.key);
    if (known) {
      stopRunning(request.key);
      showResult(request, known);
      return;
    }
    showRulesOnly(
      request,
      final ? 'AI check waiting…' : 'AI check waits for the sender checks…',
      true,
    );
    // The same email is already being checked: use that run's answer.
    if (current && adoptable(request)) {
      current.id = request.id;
      startTicker();
      return;
    }
    timer = setTimeout(() => enqueue(request), final ? STABLE_MS : waitMs);
  }

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
      set(elements.overall, '');
      set(elements.status, '');
      elements.reasons.replaceChildren();
      set(elements.advice, '');
    },
  };
}
