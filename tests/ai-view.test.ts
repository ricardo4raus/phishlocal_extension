// @vitest-environment jsdom
// The AI check in the side panel, with the model replaced by a controllable fake.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCheckResult } from '../src/ai';
import type { Email } from '../src/email';
import type { Finding } from '../src/rules';
import {
  type AiCheck,
  type AiCheckDeps,
  createAiCheck,
  HEADERS_WAIT_MS,
  RUN_TIMEOUT_MS,
  STABLE_MS,
} from '../src/sidepanel/ai-view';

const email: Email = {
  sender: { name: 'Lumora Bank', address: 'news@lumorabank.example' },
  subject: 'Statement',
  bodyText: 'Hello',
  links: [],
  truncated: false,
};

const finding = (severity: Finding['severity']): Finding => ({
  rule: 'urgency',
  severity,
  message: 'x',
  evidence: [],
});

const verdict = (
  risk: 'safe' | 'suspicious' | 'dangerous',
  advice = 'AI advice.',
): AiCheckResult => ({
  ok: true,
  verdict: { risk, reasons: [`AI reason (${risk})`], advice },
  durationMs: 1_234,
});

let prompts: string[];
let pending: ((result: AiCheckResult) => void)[];
let modelReady: () => Promise<boolean>;
let check: AiCheck;

const get = (id: string) => document.getElementById(id) as HTMLElement;
const text = (id: string): string => get(id).textContent ?? '';
const reasons = (): string[] =>
  [...document.querySelectorAll('#reasons li')].map((item) => item.textContent ?? '');

function create(deps: Partial<AiCheckDeps> = {}): AiCheck {
  return createAiCheck(
    {
      verdict: get('verdict'),
      overall: get('overall'),
      status: get('status'),
      reasons: get('reasons') as HTMLUListElement,
      advice: get('advice'),
    },
    {
      run: (prompt) => {
        prompts.push(prompt);
        return new Promise((resolve) => pending.push(resolve));
      },
      uiLanguage: () => 'de-CH',
      modelReady: () => modelReady(),
      ...deps,
    },
  );
}

/** Shows an email and lets the "unchanged for a moment" delay pass. */
async function show(shown: Email, findings: Finding[] | undefined = [], final = true) {
  check.shown(shown, findings, final);
  await vi.advanceTimersByTimeAsync(final ? STABLE_MS : 0);
}

/** Answers the oldest waiting model run. */
async function answer(result: AiCheckResult): Promise<void> {
  pending.shift()?.(result);
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  prompts = [];
  pending = [];
  modelReady = async () => true;
  document.body.innerHTML =
    '<div id="verdict" hidden><p id="overall"></p><p id="status"></p><ul id="reasons"></ul>' +
    '<p id="advice"></p></div>';
  check = create();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AI check view', () => {
  it('shows the rules at once, then the AI verdict in the user language', async () => {
    check.shown(email, [finding('warning')], true);
    expect(text('overall')).toBe('Suspicious (rule checks)');
    await vi.advanceTimersByTimeAsync(STABLE_MS);
    expect(prompts[0]).toMatch(/advice in German/);
    await answer(verdict('suspicious'));
    expect(text('overall')).toBe('Suspicious');
    expect(reasons()).toEqual(['AI reason (suspicious)']);
    expect(text('advice')).toBe('AI advice.');
    expect(text('status')).toBe('On-device (Gemini Nano). AI can be wrong. 1.2 s.');
  });

  it('never lets the AI lower the rules, and then uses our own advice', async () => {
    await show(email, [finding('danger')]);
    await answer(verdict('safe', 'Log in to confirm, all is fine.'));
    expect(text('overall')).toBe('Dangerous (rule checks; the AI said: no signs of phishing)');
    expect(text('advice')).toMatch(/^Do not click links/);
  });

  it('lets the AI raise the risk', async () => {
    await show(email);
    await answer(verdict('dangerous', 'Delete it.'));
    expect(text('overall')).toBe('Dangerous');
    expect(text('advice')).toBe('Delete it.');
  });

  it('waits for the headers of a Gmail email, but not forever', async () => {
    await show(email, [], false);
    await vi.advanceTimersByTimeAsync(HEADERS_WAIT_MS - 100);
    expect(prompts).toHaveLength(0);
    await show(email, [finding('danger')]);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatch(/"severity":"danger"/);

    await show({ ...email, subject: 'Slow headers' }, [], false);
    await vi.advanceTimersByTimeAsync(HEADERS_WAIT_MS);
    await answer(verdict('safe'));
    expect(prompts).toHaveLength(2);
  });

  it('starts only when the shown email has stopped changing', async () => {
    check.shown({ ...email, subject: 'First' }, [], true);
    await vi.advanceTimersByTimeAsync(STABLE_MS - 100);
    check.shown({ ...email, subject: 'Second' }, [], true);
    await vi.advanceTimersByTimeAsync(STABLE_MS - 100);
    check.shown({ ...email, subject: 'Third' }, [], true);
    await vi.advanceTimersByTimeAsync(STABLE_MS);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatch(/Third/);
  });

  it('runs one check at a time, only for the newest email, and drops old results', async () => {
    await show({ ...email, subject: 'First' });
    await show({ ...email, subject: 'Second' });
    await show({ ...email, subject: 'Third' });
    expect(prompts).toHaveLength(1);
    await answer(verdict('dangerous'));
    // The first result belongs to an email that is no longer shown.
    expect(text('overall')).toBe('Checking… (the rule checks found no red flags)');
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/Third/);
    await answer(verdict('suspicious'));
    expect(text('overall')).toBe('Suspicious');
  });

  it('uses the running check for the same email shown again, also without headers', async () => {
    await show(email);
    check.shown(email, [], false);
    await show(email);
    expect(prompts).toHaveLength(1);
    await answer(verdict('suspicious'));
    expect(text('overall')).toBe('Suspicious');
    await vi.advanceTimersByTimeAsync(HEADERS_WAIT_MS);
    expect(prompts).toHaveLength(1);
  });

  it('waits for the model to load without counting it against the time limit', async () => {
    let loaded: ((ready: boolean) => void) | undefined;
    modelReady = () =>
      new Promise((resolve) => {
        loaded = resolve;
      });
    await show(email);
    await vi.advanceTimersByTimeAsync(RUN_TIMEOUT_MS + 5_000);
    expect(text('status')).toBe('AI check waits for the on-device model to load… 65 s');
    expect(prompts).toHaveLength(0);
    loaded?.(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(text('status')).toBe('AI check running on this device… 2 s');
    await answer(verdict('safe'));
    expect(text('overall')).toBe('No signs of phishing');
  });

  it('falls back to the rules without a model or a readable answer', async () => {
    modelReady = async () => false;
    await show(email, [finding('warning')]);
    expect(text('overall')).toBe('Suspicious (rule checks)');
    expect(text('status')).toMatch(/on-device model is not ready/);
    expect(prompts).toHaveLength(0);

    modelReady = async () => true;
    // The rules failed (no findings): at least "suspicious".
    check.shown(email, undefined, true);
    await vi.advanceTimersByTimeAsync(STABLE_MS);
    await answer({ ok: false, reason: 'unreadable-answer' });
    expect(text('overall')).toBe('Suspicious (rule checks)');
    expect(text('status')).toMatch(/could not be read/);
    await show({ ...email, subject: 'Too long' });
    await answer({ ok: false, reason: 'failed', detail: 'The input is too large.' });
    expect(text('status')).toBe(
      'The AI check failed (The input is too large.). The rule checks still apply.',
    );
  });

  it('clears the view and drops a late result when the email is hidden', async () => {
    await show(email);
    check.hidden();
    await answer(verdict('dangerous'));
    expect(text('overall')).toBe('');
    expect(reasons()).toEqual([]);
    expect(get('verdict').hidden).toBe(true);
    expect(get('verdict').dataset.risk).toBeUndefined();
  });

  it('shows no green light before the AI has answered', async () => {
    const risk = () => get('verdict').dataset.risk;
    check.shown(email, [], true);
    expect(get('verdict').hidden).toBe(false);
    expect(risk()).toBe('pending');
    expect(text('overall')).toBe('Checking… (the rule checks found no red flags)');
    expect(text('advice')).toBe('');
    await vi.advanceTimersByTimeAsync(STABLE_MS);
    await answer(verdict('safe'));
    expect(risk()).toBe('safe');

    // Rule warnings show their colour at once: the AI can only raise them.
    check.shown({ ...email, subject: 'Warned' }, [finding('warning')], true);
    expect(risk()).toBe('suspicious');
    expect(text('advice')).toMatch(/^Be careful/);
    await vi.advanceTimersByTimeAsync(STABLE_MS);
    await answer(verdict('dangerous', 'Delete it.'));
    expect(risk()).toBe('dangerous');

    // Without a model, the rules' verdict stands, green included.
    modelReady = async () => false;
    await show({ ...email, subject: 'No model' });
    expect(risk()).toBe('safe');
    expect(text('overall')).toBe('No signs of phishing (rule checks)');
  });

  it('shows green for a confirmed sender whose AI concerns are only notes', async () => {
    await show({
      ...email,
      headers: {
        replyTo: [],
        auth: { server: 'mx.google.com', spf: 'pass', dkim: [{ result: 'pass' }], dmarc: 'pass' },
      },
    });
    await answer(verdict('dangerous'));
    expect(get('verdict').dataset.risk).toBe('safe');
  });

  it("passes the language and the email's own addresses, and marks experimental languages", async () => {
    const calls: [string, ReadonlySet<string>][] = [];
    check = create({
      run: async (_prompt, language, known) => {
        calls.push([language, known]);
        return verdict('safe');
      },
      uiLanguage: () => 'it-IT',
    });
    await show({
      ...email,
      sender: { name: '', address: 'News@Lumorabank.example' },
      links: [{ text: 'Write', href: 'mailto:Support.Me%40gmail.example?subject=x' }],
    });
    expect(calls[0]?.[0]).toBe('it');
    expect([...(calls[0]?.[1] ?? [])]).toEqual([
      'news@lumorabank.example',
      'support.me@gmail.example',
    ]);
    expect(text('status')).toMatch(/Answers in this language are experimental/);
  });

  it('shows AI concerns only as notes for a confirmed sender without rule warnings', async () => {
    const confirmed: Email = {
      ...email,
      headers: {
        replyTo: [],
        auth: { server: 'mx.google.com', spf: 'pass', dkim: [{ result: 'pass' }], dmarc: 'pass' },
      },
    };
    await show(confirmed);
    await answer(verdict('suspicious', 'Check the URL carefully.'));
    expect(text('overall')).toBe(
      'No signs of phishing (sender confirmed, rule checks found nothing; AI notes below)',
    );
    expect(reasons()).toEqual(['AI reason (suspicious)']);
    expect(text('advice')).toMatch(/^No signs of phishing found/);

    // A rule warning lets the AI raise the verdict again.
    await show(confirmed, [finding('warning')]);
    await answer(verdict('dangerous', 'Delete it.'));
    expect(text('overall')).toBe('Dangerous');
  });

  it('shows how long the check runs and how long the next email waits', async () => {
    await show(email);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(text('status')).toBe('AI check running on this device… 3 s');
    await show({ ...email, subject: 'Next' });
    await vi.advanceTimersByTimeAsync(2_000);
    // The status is updated once a second.
    expect(text('status')).toMatch(
      /^AI check waits for the previous email's check to finish… [23] s$/,
    );
  });

  it('gives up a run after the time limit and goes on with the next email', async () => {
    await show(email);
    await show({ ...email, subject: 'Next' });
    await vi.advanceTimersByTimeAsync(RUN_TIMEOUT_MS);
    expect(prompts).toHaveLength(2);
    pending[1]?.(verdict('dangerous'));
    await vi.advanceTimersByTimeAsync(0);
    expect(text('overall')).toBe('Dangerous');

    await show({ ...email, subject: 'Slow' });
    await vi.advanceTimersByTimeAsync(RUN_TIMEOUT_MS);
    expect(text('status')).toBe(
      'The AI check failed (no answer within 60 s). The rule checks still apply.',
    );
  });

  it('keeps going when a run throws', async () => {
    check = create({
      run: async (prompt) => {
        if (prompt.includes('Broken')) throw new Error('boom');
        return verdict('suspicious');
      },
      uiLanguage: () => 'en',
    });
    await show({ ...email, subject: 'Broken' });
    expect(text('status')).toBe('The AI check failed (boom). The rule checks still apply.');
    await show(email);
    expect(text('overall')).toBe('Suspicious');
  });
});
