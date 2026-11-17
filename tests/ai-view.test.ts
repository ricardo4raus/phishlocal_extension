// @vitest-environment jsdom
// The AI check in the side panel, with the model replaced by a controllable fake.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCheckResult } from '../src/ai';
import type { Email } from '../src/email';
import type { Finding } from '../src/rules';
import { type AiCheck, createAiCheck, HEADERS_WAIT_MS } from '../src/sidepanel/ai-view';

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
let check: AiCheck;

const text = (id: string): string => document.getElementById(id)?.textContent ?? '';
const reasons = (): string[] =>
  [...document.querySelectorAll('#reasons li')].map((item) => item.textContent ?? '');

const get = (id: string) => document.getElementById(id) as HTMLElement;

/** Answers the oldest waiting model run. */
async function answer(result: AiCheckResult): Promise<void> {
  pending.shift()?.(result);
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  prompts = [];
  pending = [];
  document.body.innerHTML =
    '<p id="overall"></p><p id="status"></p><ul id="reasons"></ul><p id="advice"></p>';
  check = createAiCheck(
    {
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
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AI check view', () => {
  it('shows the rules at once, then the AI verdict in the user language', async () => {
    check.shown(email, [finding('warning')], true);
    expect(text('overall')).toBe('Suspicious (rule checks)');
    expect(prompts[0]).toMatch(/advice in German/);
    await answer(verdict('suspicious'));
    expect(text('overall')).toBe('Suspicious');
    expect(reasons()).toEqual(['AI reason (suspicious)']);
    expect(text('advice')).toBe('AI advice.');
    expect(text('status')).toBe('On-device (Gemini Nano). AI can be wrong. 1.2 s.');
  });

  it('never lets the AI lower the rules, and then uses our own advice', async () => {
    check.shown(email, [finding('danger')], true);
    await answer(verdict('safe', 'Log in to confirm, all is fine.'));
    expect(text('overall')).toBe('Dangerous (rule checks; the AI said: no signs of phishing)');
    expect(text('advice')).toMatch(/^Do not click links/);
  });

  it('lets the AI raise the risk', async () => {
    check.shown(email, [], true);
    await answer(verdict('dangerous', 'Delete it.'));
    expect(text('overall')).toBe('Dangerous');
    expect(text('advice')).toBe('Delete it.');
  });

  it('waits for the headers of a Gmail email, but not forever', async () => {
    check.shown(email, [], false);
    await vi.advanceTimersByTimeAsync(HEADERS_WAIT_MS - 100);
    expect(prompts).toHaveLength(0);
    check.shown(email, [finding('danger')], true);
    await vi.advanceTimersByTimeAsync(HEADERS_WAIT_MS);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatch(/"severity":"danger"/);

    check.shown({ ...email, subject: 'Slow headers' }, [], false);
    await vi.advanceTimersByTimeAsync(HEADERS_WAIT_MS);
    await answer(verdict('safe'));
    expect(prompts).toHaveLength(2);
  });

  it('runs one check at a time, only for the newest email, and drops old results', async () => {
    check.shown({ ...email, subject: 'First' }, [], true);
    check.shown({ ...email, subject: 'Second' }, [], true);
    check.shown({ ...email, subject: 'Third' }, [], true);
    expect(prompts).toHaveLength(1);
    await answer(verdict('dangerous'));
    // The first result belongs to an email that is no longer shown.
    expect(text('overall')).toBe('No signs of phishing (rule checks)');
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/Third/);
    await answer(verdict('suspicious'));
    expect(text('overall')).toBe('Suspicious');
  });

  it('falls back to the rules without a model or a readable answer', async () => {
    check.shown(email, [finding('warning')], true);
    await answer({ ok: false, reason: 'no-model' });
    expect(text('overall')).toBe('Suspicious (rule checks)');
    expect(text('status')).toMatch(/on-device model is not ready/);
    check.shown(email, undefined, true);
    await answer({ ok: false, reason: 'unreadable-answer' });
    expect(text('overall')).toBe('Suspicious (rule checks)');
    expect(text('status')).toMatch(/could not be read/);
    check.shown(email, [], true);
    await answer({ ok: false, reason: 'failed', detail: 'The input is too large.' });
    expect(text('status')).toBe(
      'The AI check failed (The input is too large.). The rule checks still apply.',
    );
  });

  it('clears the view and drops a late result when the email is hidden', async () => {
    check.shown(email, [], true);
    check.hidden();
    await answer(verdict('dangerous'));
    expect(text('overall')).toBe('');
    expect(reasons()).toEqual([]);
  });
});
