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
  run: (
    prompt: string,
    language: string,
    knownAddresses: ReadonlySet<string>,
  ) => Promise<AiCheckResult>;
  /** Chrome's UI language, e.g. "de-CH". */
  uiLanguage: () => string;
  /**
   * Waits until the on-device model is loaded (that can take minutes in a bad Chrome state) and
   * says whether it is ready. The run's time limit starts only after that.
   */
  modelReady: () => Promise<boolean>;
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
}

/**
 * Gmail shows an email several times within a moment (without headers, with headers, more
 * rendered). A check starts only once the shown email has not changed for this long, so no run is
 * wasted on a version that is replaced right away.
 */
export const STABLE_MS = 500;

/** A run that has not answered after this long is given up (the queue moves on). */
export const RUN_TIMEOUT_MS = 60_000;

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
  /** Whether the last answer was in a language Gemini Nano marks as experimental. */
  let experimental = false;

  /** Shows how long the shown email's check has been running or waiting. */
  const tick = (): void => {
    const now = performance.now();
    if (current?.id === shownId) {
      set(
        elements.status,
        current.phase === 'model'
          ? `AI check waits for the on-device model to load… ${seconds(now - current.since)}`
          : `AI check running on this device… ${seconds(now - current.since)}`,
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

  function showRulesOnly(request: Request, note: string): void {
    const risk = rulesRisk(request.findings);
    set(elements.overall, `${LABEL[risk]} (rule checks)`);
    set(elements.status, note);
    elements.reasons.replaceChildren();
    set(elements.advice, ADVICE[risk]);
  }

  function showResult(request: Request, result: AiCheckResult): void {
    if (!result.ok) {
      const note =
        result.reason === 'no-model'
          ? 'AI check not available: the on-device model is not ready. Rule checks only.'
          : result.reason === 'failed'
            ? `The AI check failed (${result.detail ?? 'unknown error'}). The rule checks still apply.`
            : 'The AI answer could not be read. The rule checks still apply.';
      showRulesOnly(request, note);
      return;
    }
    const rules = rulesRisk(request.findings);
    const { verdict } = result;
    const confirmed = senderConfirmed(request.email);
    const overall = overallRisk(verdict.risk, rules, { senderConfirmed: confirmed });
    const stricter = overall !== verdict.risk;
    // The AI was more worried, but the sender is confirmed and the rules found nothing.
    const onlyNotes = confirmed && RISKS.indexOf(verdict.risk) > RISKS.indexOf(overall);
    set(
      elements.overall,
      onlyNotes
        ? `${LABEL[overall]} (sender confirmed, rule checks found nothing; AI notes below)`
        : stricter
          ? `${LABEL[overall]} (rule checks; the AI said: ${LABEL[verdict.risk].toLowerCase()})`
          : LABEL[overall],
    );
    const note = experimental ? `${AI_NOTE} Answers in this language are experimental.` : AI_NOTE;
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

  /** Runs one request, never longer than RUN_TIMEOUT_MS, and never throws. */
  async function runOnce(request: Request): Promise<AiCheckResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const tooLong = new Promise<AiCheckResult>((resolve) => {
      timeout = setTimeout(
        () =>
          resolve({
            ok: false,
            reason: 'failed',
            detail: `no answer within ${seconds(RUN_TIMEOUT_MS)}`,
          }),
        RUN_TIMEOUT_MS,
      );
    });
    try {
      const prompt = buildUserPrompt(request.email, request.findings ?? [], request.language);
      return await Promise.race([
        deps.run(prompt, request.language, ownAddresses(request.email)),
        tooLong,
      ]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: 'failed', detail };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function drain(): Promise<void> {
    if (current) return;
    for (let request = waiting; request; request = waiting) {
      waiting = undefined;
      if (request.id !== shownId) continue;
      current = { ...request, since: performance.now(), phase: 'model' };
      startTicker();
      // Loading the model does not count against the run's time limit.
      const ready = await deps.modelReady().catch(() => false);
      let result: AiCheckResult;
      if (ready) {
        current.phase = 'run';
        current.since = performance.now();
        tick();
        result = await runOnce(current);
      } else {
        result = { ok: false, reason: 'no-model' };
      }
      experimental = EXPERIMENTAL_LANGUAGES.has(current.language);
      const finished = current;
      current = undefined;
      if (finished.id === shownId) showResult(finished, result);
    }
    tick();
  }

  const enqueue = (request: Request): void => {
    // The same check is already running (e.g. Gmail showed the email again): use its answer.
    if (current?.key === request.key) {
      current.id = request.id;
      startTicker();
      return;
    }
    waiting = request;
    startTicker();
    void drain();
  };

  return {
    shown(email, findings, final) {
      clearTimeout(timer);
      const language = answerLanguage(deps.uiLanguage());
      const request: Request = {
        id: ++shownId,
        email,
        findings,
        language,
        key: `${language}|${JSON.stringify(promptData(email, findings ?? []))}`,
        since: performance.now(),
      };
      showRulesOnly(request, final ? 'AI check waiting…' : 'AI check waits for the sender checks…');
      // The same email is already being checked: use that run's answer.
      if (current?.key === request.key) {
        current.id = request.id;
        startTicker();
        return;
      }
      timer = setTimeout(() => enqueue(request), final ? STABLE_MS : waitMs);
    },
    hidden() {
      clearTimeout(timer);
      shownId++;
      waiting = undefined;
      set(elements.overall, '');
      set(elements.status, '');
      elements.reasons.replaceChildren();
      set(elements.advice, '');
    },
  };
}
