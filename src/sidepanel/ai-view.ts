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
import { answerLanguage, buildUserPrompt } from '../ai/prompt';
import { overallRisk, type Risk, ruleRisk } from '../ai/verdict';
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

const set = (element: HTMLElement, text: string): void => {
  element.textContent = text;
};

/** The rules' risk; if the rules failed, at least "suspicious". */
const rulesRisk = (findings: Finding[] | undefined): Risk =>
  findings ? ruleRisk(findings) : 'suspicious';

export interface AiCheckDeps {
  run: (prompt: string) => Promise<AiCheckResult>;
  /** Chrome's UI language, e.g. "de-CH". */
  uiLanguage: () => string;
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
}

export function createAiCheck(elements: AiElements, deps: AiCheckDeps): AiCheck {
  const waitMs = deps.headersWaitMs ?? HEADERS_WAIT_MS;
  /** Id of the email shown now; results for other ids are dropped. */
  let shownId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let waiting: Request | undefined;

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
          : 'The AI answer could not be read. The rule checks still apply.';
      showRulesOnly(request, note);
      return;
    }
    const rules = rulesRisk(request.findings);
    const { verdict } = result;
    const overall = overallRisk(verdict.risk, rules);
    const stricter = overall !== verdict.risk;
    set(
      elements.overall,
      stricter
        ? `${LABEL[overall]} (rule checks; the AI said: ${LABEL[verdict.risk].toLowerCase()})`
        : LABEL[overall],
    );
    set(elements.status, `${AI_NOTE} ${(result.durationMs / 1000).toFixed(1)} s.`);
    elements.reasons.replaceChildren(
      ...verdict.reasons.map((reason) => {
        const item = document.createElement('li');
        item.textContent = reason;
        return item;
      }),
    );
    set(elements.advice, stricter || !verdict.advice ? ADVICE[overall] : verdict.advice);
  }

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
      for (let request = waiting; request; request = waiting) {
        waiting = undefined;
        if (request.id !== shownId) continue;
        set(elements.status, 'AI check running on this device…');
        const prompt = buildUserPrompt(
          request.email,
          request.findings ?? [],
          answerLanguage(deps.uiLanguage()),
        );
        const result = await deps.run(prompt);
        if (request.id === shownId) showResult(request, result);
      }
    } finally {
      running = false;
    }
  }

  const enqueue = (request: Request): void => {
    waiting = request;
    void drain();
  };

  return {
    shown(email, findings, final) {
      clearTimeout(timer);
      const request: Request = { id: ++shownId, email, findings };
      showRulesOnly(request, final ? 'AI check waiting…' : 'AI check waits for the sender checks…');
      if (final) enqueue(request);
      else timer = setTimeout(() => enqueue(request), waitMs);
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
