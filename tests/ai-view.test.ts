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
  LOADING_HINT_MS,
  MAX_REMEMBERED,
  RUN_TIMEOUT_MS,
  STABLE_MS,
  STOP_GRACE_MS,
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
let signals: AbortSignal[];
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
      // Like runAiCheck: a stop ends the run at once.
      run: (prompt, _language, _known, signal) => {
        prompts.push(prompt);
        signals.push(signal);
        return new Promise((resolve) => {
          pending.push(resolve);
          signal.addEventListener('abort', () => {
            const at = pending.indexOf(resolve);
            if (at >= 0) pending.splice(at, 1);
            resolve({ ok: false, reason: 'stopped', detail: 'the model had written 0 characters' });
          });
        });
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
  signals = [];
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

  it('stops the check of an email that is no longer shown and runs the newest', async () => {
    await show({ ...email, subject: 'First' });
    await show({ ...email, subject: 'Second' });
    expect(signals[0]?.aborted).toBe(true);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/Second/);
    expect(text('status')).toBe('AI check running on this device… 0 s');
    await answer(verdict('suspicious'));
    expect(text('overall')).toBe('Suspicious');
  });

  it('moves on from a run that ignores its stop, and drops its late answer', async () => {
    check = create({
      run: (prompt) => {
        prompts.push(prompt);
        return new Promise((resolve) => pending.push(resolve));
      },
    });
    await show({ ...email, subject: 'First' });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(text('status')).toBe('AI check running on this device… 3 s');
    await show({ ...email, subject: 'Second' });
    await vi.advanceTimersByTimeAsync(1_000);
    // The status is updated once a second.
    expect(text('status')).toMatch(
      /^AI check waits for the previous email's check to finish… [01] s$/,
    );
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/Second/);
    // The first run answers late: it belongs to an email that is no longer shown.
    pending.shift()?.(verdict('dangerous'));
    await vi.advanceTimersByTimeAsync(0);
    expect(text('overall')).toBe('Checking… (the rule checks found no red flags)');
    await answer(verdict('suspicious'));
    expect(text('overall')).toBe('Suspicious');
  });

  it('does not spend the model on an email left while the model loaded', async () => {
    let loaded: ((ready: boolean) => void) | undefined;
    const ready = new Promise<boolean>((resolve) => {
      loaded = resolve;
    });
    modelReady = () => ready;
    await show({ ...email, subject: 'First' });
    await show({ ...email, subject: 'Second' });
    loaded?.(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatch(/Second/);
  });

  it('stops the running check when the email is hidden', async () => {
    await show(email);
    check.hidden();
    expect(signals[0]?.aborted).toBe(true);
  });

  it('checks the shown email again on request, e.g. after the model download', async () => {
    modelReady = async () => false;
    await show(email);
    expect(text('status')).toMatch(/on-device model is not ready/);
    modelReady = async () => true;
    check.recheck();
    await vi.advanceTimersByTimeAsync(STABLE_MS);
    expect(prompts).toHaveLength(1);
    await answer(verdict('suspicious'));
    expect(text('overall')).toBe('Suspicious');
    // A known answer is reused, and nothing is rechecked once the email is hidden.
    check.recheck();
    expect(text('overall')).toBe('Suspicious');
    check.hidden();
    check.recheck();
    await vi.advanceTimersByTimeAsync(STABLE_MS);
    expect(prompts).toHaveLength(1);
    expect(get('verdict').hidden).toBe(true);
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
    expect(text('status')).toMatch(
      /^On-device model still loading… 65 s\. Rule checks done\. The AI result appears here by itself; /,
    );
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
    expect(get('status').classList.contains('ai-failed')).toBe(false);
    expect(prompts).toHaveLength(0);

    modelReady = async () => true;
    // The rules failed (no findings): at least "suspicious".
    check.shown(email, undefined, true);
    await vi.advanceTimersByTimeAsync(STABLE_MS);
    // Each failure is tried once more.
    await answer({ ok: false, reason: 'unreadable-answer' });
    await answer({ ok: false, reason: 'unreadable-answer' });
    expect(text('overall')).toBe('Suspicious (rule checks only: the AI check failed)');
    expect(text('status')).toBe(
      'The AI answer could not be read after a second try. The rule checks still apply.',
    );
    // An error that would come back the same is not tried again.
    const before = prompts.length;
    await show({ ...email, subject: 'Too long' });
    await answer({ ok: false, reason: 'failed', detail: 'The input is too large.' });
    expect(prompts).toHaveLength(before + 1);
    expect(text('status')).toBe(
      'The AI check failed (The input is too large.). The rule checks still apply.',
    );
  });

  it('says on the verdict line when the AI check failed, also for a green light', async () => {
    await show(email);
    await vi.advanceTimersByTimeAsync(RUN_TIMEOUT_MS);
    expect(get('verdict').dataset.risk).toBe('safe');
    expect(text('overall')).toBe('No signs of phishing (rule checks only: the AI check failed)');
    expect(get('status').classList.contains('ai-failed')).toBe(true);
    // The next answer clears the mark.
    await show({ ...email, subject: 'Next' });
    expect(get('status').classList.contains('ai-failed')).toBe(false);
    await answer(verdict('safe'));
    expect(get('status').classList.contains('ai-failed')).toBe(false);
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

  it('shows a recent answer again at once when the same email comes back', async () => {
    await show(email);
    await answer(verdict('dangerous', 'Delete it.'));
    await show({ ...email, subject: 'Other' });
    await answer({ ok: false, reason: 'failed', detail: 'boom' });
    await answer({ ok: false, reason: 'failed', detail: 'boom' });
    expect(prompts).toHaveLength(3);

    check.shown(email, [], false);
    expect(get('verdict').dataset.risk).toBe('dangerous');
    expect(text('advice')).toBe('Delete it.');
    await vi.advanceTimersByTimeAsync(HEADERS_WAIT_MS);
    expect(prompts).toHaveLength(3);

    // A failed run is not remembered: it is tried again.
    await show({ ...email, subject: 'Other' });
    expect(prompts).toHaveLength(4);
  });

  it('remembers only the most recent answers', async () => {
    for (let i = 0; i <= MAX_REMEMBERED; i++) {
      await show({ ...email, subject: `Email ${i}` });
      await answer(verdict('safe'));
    }
    await show({ ...email, subject: `Email ${MAX_REMEMBERED}` });
    expect(prompts).toHaveLength(MAX_REMEMBERED + 1);
    await show({ ...email, subject: 'Email 0' });
    expect(prompts).toHaveLength(MAX_REMEMBERED + 2);
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

  it('stops a run after the time limit, says how far it had come, and goes on', async () => {
    await show(email);
    await vi.advanceTimersByTimeAsync(RUN_TIMEOUT_MS);
    expect(signals[0]?.aborted).toBe(true);
    // A hung model would most likely hang again: no second try after the time limit.
    expect(prompts).toHaveLength(1);
    expect(text('status')).toBe(
      'The AI check failed (no answer within 60 s; the model had written 0 characters). The rule checks still apply.',
    );
    await show({ ...email, subject: 'Next' });
    expect(prompts).toHaveLength(2);
    await answer(verdict('dangerous'));
    expect(text('overall')).toBe('Dangerous');
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
    expect(text('status')).toBe(
      'The AI check failed after a second try (boom). The rule checks still apply.',
    );
    await show(email);
    expect(text('overall')).toBe('Suspicious');
  });

  it('tries a failed check once more, reloading the model first, and shows the answer', async () => {
    let loads = 0;
    modelReady = async () => {
      loads++;
      return true;
    };
    await show(email);
    await answer({ ok: false, reason: 'failed', detail: 'Session crashed' });
    expect(loads).toBe(2);
    expect(prompts).toHaveLength(2);
    expect(text('status')).toBe('AI check running on this device (second try)… 0 s');
    expect(text('overall')).toBe('Checking… (the rule checks found no red flags)');
    await answer(verdict('suspicious'));
    expect(text('overall')).toBe('Suspicious');
    expect(get('status').classList.contains('ai-failed')).toBe(false);
  });

  it('does not try again without a model, after a stop, or for an email that is gone', async () => {
    // No model for the second try: the first failure is shown, as a single failure.
    let tries = 0;
    modelReady = async () => ++tries === 1;
    await show(email);
    await answer({ ok: false, reason: 'failed', detail: 'Session crashed' });
    expect(prompts).toHaveLength(1);
    expect(text('status')).toBe(
      'The AI check failed (Session crashed). The rule checks still apply.',
    );

    // A stopped run (its email was left) is not tried again.
    modelReady = async () => true;
    await show({ ...email, subject: 'First' });
    await show({ ...email, subject: 'Second' });
    expect(prompts).toHaveLength(3);
    expect(prompts[2]).toMatch(/Second/);

    // The email is gone when the first try fails: no second try.
    pending.shift()?.({ ok: false, reason: 'failed', detail: 'boom' });
    check.hidden();
    await vi.advanceTimersByTimeAsync(0);
    expect(prompts).toHaveLength(3);
  });

  it('shows the loading text only when the model really takes time to load', async () => {
    let loaded: ((ready: boolean) => void) | undefined;
    const ready = new Promise<boolean>((resolve) => {
      loaded = resolve;
    });
    modelReady = () => ready;
    await show(email);
    expect(text('status')).toBe('AI check running on this device… 0 s');
    await vi.advanceTimersByTimeAsync(LOADING_HINT_MS);
    expect(text('status')).toMatch(/^On-device model still loading… 1 s\. Rule checks done\. /);
    loaded?.(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(text('status')).toBe('AI check running on this device… 0 s');
  });

  it('uses the check that waits for the model for an email shown again', async () => {
    let loaded: ((ready: boolean) => void) | undefined;
    let loads = 0;
    const ready = new Promise<boolean>((resolve) => {
      loaded = resolve;
    });
    modelReady = () => {
      loads++;
      return ready;
    };
    await show({ ...email, subject: 'A' });
    // B is shown and A again, while A's check still waits for the model.
    check.shown({ ...email, subject: 'B' }, [], true);
    await show({ ...email, subject: 'A' });
    loaded?.(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(loads).toBe(1);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatch(/"subject":"A"/);
  });

  it('does not try again when there is no model', async () => {
    let loads = 0;
    modelReady = async () => {
      loads++;
      return false;
    };
    await show(email);
    expect(loads).toBe(1);
    expect(text('status')).toMatch(/on-device model is not ready/);
  });

  it('names only the last reason when the two tries fail differently', async () => {
    await show(email);
    await answer({ ok: false, reason: 'failed', detail: 'Session crashed' });
    await answer({ ok: false, reason: 'unreadable-answer' });
    expect(text('status')).toBe(
      'The AI answer could not be read after a second try. The rule checks still apply.',
    );
  });

  it('does not call the rules done while loading when they failed, and marks a second try', async () => {
    let loaded: ((ready: boolean) => void) | undefined;
    let loads = 0;
    modelReady = () => {
      loads++;
      return loads === 1
        ? Promise.resolve(true)
        : new Promise((resolve) => {
            loaded = resolve;
          });
    };
    check.shown(email, undefined, true);
    await vi.advanceTimersByTimeAsync(STABLE_MS);
    await answer({ ok: false, reason: 'failed', detail: 'Session crashed' });
    // The second try waits for the model to load again.
    await vi.advanceTimersByTimeAsync(LOADING_HINT_MS);
    expect(text('status')).toMatch(
      /^On-device model still loading \(second try\)… 1 s\. The AI result appears here by itself; /,
    );
    loaded?.(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(prompts).toHaveLength(2);
  });

  it('does not use a stopped run for an email shown again; it runs the email anew', async () => {
    check = create({
      run: (prompt) => {
        prompts.push(prompt);
        return new Promise((resolve) => pending.push(resolve));
      },
    });
    await show({ ...email, subject: 'A' });
    // B stops A's run, but A's run ignores the stop for a moment.
    await show({ ...email, subject: 'B' });
    // Back to A before the stopped run has ended.
    await show({ ...email, subject: 'A' });
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/"subject":"A"/);
    expect(text('status')).toMatch(/^AI check running on this device… [01] s$/);
    await answer(verdict('dangerous'));
    await answer(verdict('suspicious'));
    expect(text('overall')).toBe('Suspicious');
  });
});
