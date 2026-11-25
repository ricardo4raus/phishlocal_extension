// @vitest-environment jsdom
// Chaos monkey for the AI check in the side panel: random emails shown and hidden, random time
// jumps, and a model that answers, fails, crashes, hangs or ignores the stop signal at random.
// After every step the panel must still keep its promises.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../src/i18n/en';
import type { AiCheckResult } from '../../src/ai';
import { RISKS, type Risk, ruleRisk } from '../../src/ai/verdict';
import type { Email } from '../../src/email';
import type { Finding } from '../../src/rules';
import { type AiCheck, createAiCheck, VERDICT_WAIT_MS } from '../../src/sidepanel/ai-view';
import { forEachCase, MONKEY_TIMEOUT_MS, type Rng } from './random';

vi.setConfig({ testTimeout: MONKEY_TIMEOUT_MS });

/**
 * Six emails; each run's prompt names its email by the token in the subject. The last two come
 * from a confirmed sender (DMARC pass), where the AI alone may not raise the verdict.
 */
const BASE_EMAILS: Email[] = [0, 1, 2, 3, 4, 5].map((number) => ({
  sender: { name: 'Lumora Bank', address: `news${number}@lumorabank.example` },
  subject: `MAIL${number}`,
  bodyText: 'Hello',
  links: [],
  truncated: false,
  ...(number >= 4
    ? {
        headers: {
          replyTo: [],
          auth: { server: 'mx.google.com', dkim: [{ result: 'pass' }], dmarc: 'pass' },
        },
      }
    : {}),
}));

/**
 * Plus MAIL1 with a Reply-To: the same prompt, but other own addresses, which the answer may
 * name. Its answer must never be shown for the plain MAIL1, or the other way round.
 */
const EMAILS: Email[] = [
  ...BASE_EMAILS,
  {
    ...(BASE_EMAILS[1] as Email),
    headers: { replyTo: [{ name: '', address: 'mallory@evil.example' }] },
  },
];

/** The own addresses the panel passes to the model, as the fake answer names them. */
const ownOf = (email: Email): string =>
  [
    ...new Set(
      [email.sender.address, ...(email.headers?.replyTo.map((box) => box.address) ?? [])].map(
        (address) => address.toLowerCase(),
      ),
    ),
  ]
    .toSorted()
    .join(' ');

const FINDING_SETS: (Finding[] | undefined)[] = [
  [],
  [{ rule: 'urgency', severity: 'warning', message: 'w', evidence: [] }],
  [{ rule: 'dangerous-link', severity: 'danger', message: 'd', evidence: [] }],
  [{ rule: 'urgency', severity: 'info', message: 'i', evidence: [] }],
  undefined, // The rules failed.
];

const LEVEL: Record<Risk, number> = { safe: 0, suspicious: 1, dangerous: 2 };

interface Run {
  email: string;
  signal: AbortSignal;
  settled: boolean;
}

/** The test's own model of what the panel shows. */
interface Shown {
  email: Email;
  findings: Finding[] | undefined;
}

const tokenOf = (text: string): string => /MAIL\d/.exec(text)?.[0] ?? '?';

let runs: Run[];
/** Broken promises seen inside the fake model. */
let violations: string[];
/** What happened, for the failure message. */
let trace: string[];
let shown: Shown | undefined;
/** In the end phase the model behaves: everything answers, so the panel must come to rest. */
let calm: boolean;
/** When the shown email last got its "Checking…" band (show or recheck). */
let shownAt = 0;
let check: AiCheck;

const get = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

function create(rng: Rng): AiCheck {
  return createAiCheck(
    {
      verdict: get('verdict'),
      overall: get('overall'),
      status: get('status'),
      reasons: get('reasons') as HTMLUListElement,
      advice: get('advice'),
      source: get('source'),
      time: get('time'),
      stop: get('stop') as HTMLButtonElement,
      detail: get('detail'),
    },
    {
      run: (prompt, _language, known, signal) => {
        const own = [...known].toSorted().join(' ');
        const email = tokenOf(prompt);
        // Recorded, not thrown: the panel catches errors from a run.
        // One prompt at a time: every earlier run has ended or was told to stop. (A run that
        // ignores its stop is let go after STOP_GRACE_MS by design, so the queue cannot hang on
        // it; Chrome's own runs follow the signal.)
        if (runs.some((run) => !run.settled && !run.signal.aborted)) {
          violations.push(`a run for ${email} started while another one was live`);
        }
        // Only the email on screen is checked.
        const onScreen = shown ? tokenOf(shown.email.subject) : 'nothing';
        if (email !== onScreen)
          violations.push(`a run for ${email} started; on screen: ${onScreen}`);
        const run: Run = { email, signal, settled: false };
        trace.push(`  run ${runs.length} starts for ${email}`);
        runs.push(run);
        const behaviour = calm
          ? 'answer'
          : rng.pick(['answer', 'answer', 'fail', 'crash', 'unreadable', 'throw', 'hang', 'deaf']);
        const after = calm ? 1_000 : rng.pick([0, 10, 900, 5_000, 59_000, 70_000]);
        trace.push(`  (${behaviour} after ${after} ms)`);
        return new Promise<AiCheckResult>((resolve, reject) => {
          const end = (result: AiCheckResult | Error): void => {
            if (run.settled) return;
            run.settled = true;
            trace.push(
              `  run for ${email} ends: ${result instanceof Error ? 'throws' : JSON.stringify(result)}`,
            );
            if (result instanceof Error) reject(result);
            else resolve(result);
          };
          // A deaf run ignores its stop signal (the panel must move on without it).
          if (behaviour !== 'deaf') {
            signal.addEventListener('abort', () =>
              end({ ok: false, reason: 'stopped', detail: 'the model had written 3 characters' }),
            );
          }
          if (behaviour === 'hang' || behaviour === 'deaf') return;
          setTimeout(() => {
            if (behaviour === 'answer') {
              end({
                ok: true,
                verdict: {
                  risk: rng.pick(RISKS),
                  reasons: [`About ${email} for ${own}`],
                  advice: `Advice for ${email}`,
                },
                durationMs: after,
              });
            } else if (behaviour === 'fail') {
              end({ ok: false, reason: 'failed', detail: rng.pick(['input too large', 'x']) });
            } else if (behaviour === 'crash') {
              end({ ok: false, reason: 'failed', detail: 'Session crashed' });
            } else if (behaviour === 'unreadable') {
              end({ ok: false, reason: 'unreadable-answer' });
            } else {
              end(new Error('The model threw'));
            }
          }, after);
        });
      },
      panelLanguage: () => rng.pick(['de-CH', 'de']),
      modelReady: () => {
        const wait = calm ? 0 : rng.pick([0, 0, 500, 3_000, 300_000]);
        const outcome = calm ? 'ready' : rng.pick(['ready', 'ready', 'ready', 'no', 'throw']);
        trace.push(`  model: ${outcome} after ${wait} ms`);
        return new Promise<boolean>((resolve, reject) => {
          setTimeout(() => {
            if (outcome === 'throw') reject(new Error('Chrome refused'));
            else resolve(outcome === 'ready');
          }, wait);
        });
      },
      headersWaitMs: 3_000,
      runTimeoutMs: 60_000,
    },
  );
}

/** What the panel promises after every step. */
function checkPanel(): void {
  try {
    checkPanelOnce();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const panel = `panel: ${get('verdict').dataset.risk} | ${get('overall').textContent} | ${get('status').textContent}`;
    const steps = trace.slice(-40).join('\n');
    throw new Error(`${message}\n${panel}\nLast steps:\n${steps}`, { cause: error });
  }
}

function checkPanelOnce(): void {
  expect(violations).toEqual([]);
  const verdict = get('verdict');
  expect(verdict.hidden, 'verdict visible exactly while an email is shown').toBe(!shown);
  if (!shown) return;
  const risk = verdict.dataset.risk ?? '';
  const rules: Risk = shown.findings ? ruleRisk(shown.findings) : 'suspicious';
  // A confirmed sender whose rules found nothing: the AI may add notes, never raise the light.
  const confirmedClean = shown.email.headers?.auth?.dmarc === 'pass' && rules === 'safe';
  expect(
    confirmedClean && !['pending', 'safe', 'unchecked'].includes(risk),
    'raised a confirmed sender',
  ).toBe(false);
  const status = get('status').textContent ?? '';
  if (risk === 'unchecked') {
    // "Not checked by AI" is grey only while the rules found nothing.
    expect(rules).toBe('safe');
  } else if (risk === 'pending') {
    // "Checking…" hides rule findings only while a normal check runs: not while Chrome loads
    // the model, and not past VERDICT_WAIT_MS.
    if (rules !== 'safe') {
      expect(status, 'grey with rule findings while nothing runs').toMatch(
        /running|starting|waiting/i,
      );
      expect(status, 'grey with rule findings while the model loads').not.toMatch(/loading/i);
      expect(performance.now() - shownAt, 'grey with rule findings for too long').toBeLessThan(
        VERDICT_WAIT_MS,
      );
    }
  } else {
    expect(RISKS).toContain(risk);
    expect(LEVEL[risk as Risk], 'the verdict is never below the rules').toBeGreaterThanOrEqual(
      LEVEL[rules],
    );
  }
  // Reasons and advice shown belong to the email on screen.
  const token = tokenOf(shown.email.subject);
  const own = Object.values(en.verdict.ownReasons);
  for (const item of document.querySelectorAll('#reasons li')) {
    // Our own reasons when the AI was overruled, else made for this email and its own addresses
    // (an answer may name exactly those).
    if (own.includes(item.textContent ?? '')) continue;
    expect(item.textContent).toBe(`About ${token} for ${ownOf(shown.email)}`);
  }
  const advice = get('advice').textContent ?? '';
  if (advice.startsWith('Advice for')) expect(advice).toBe(`Advice for ${token}`);
  // A green light only with an AI answer.
  if (risk === 'safe') expect(get('source').textContent).toBe('Checked on this device');
  // Stop is offered exactly while a check runs or waits for the shown email.
  const running = /running|loading|starting|waiting/i.test(get('status').textContent ?? '');
  expect(get('stop').hidden, 'Stop shown while nothing runs, or hidden while it does').toBe(
    !running,
  );
  expect(document.body.textContent).not.toMatch(/undefined|NaN|\[object /);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('monkey: AI check view', () => {
  it('keeps its promises whatever the emails, the timing and the model do', async () => {
    await forEachCase(120, async (rng) => {
      vi.clearAllTimers();
      runs = [];
      violations = [];
      trace = [];
      shown = undefined;
      calm = false;
      document.body.innerHTML =
        '<div id="verdict" hidden><p id="overall" tabindex="-1"></p><p id="status"></p>' +
        '<ul id="reasons"></ul><p id="advice"></p><span id="source"></span><span id="time"></span>' +
        '<button id="stop" hidden></button></div><dd id="detail"></dd>';
      check = create(rng);

      for (let step = 0; step < 40; step++) {
        const action = rng.pick([
          'show',
          'show',
          'show',
          'hide',
          'recheck',
          'stop',
          'wait',
          'wait',
          'wait',
        ]);
        if (action === 'show') {
          shown = { email: rng.pick(EMAILS), findings: rng.pick(FINDING_SETS) };
          const final = rng.chance(0.7);
          trace.push(
            `show ${shown.email.subject} rules ${shown.findings ? ruleRisk(shown.findings) : 'failed'}${final ? '' : ' (headers to come)'}`,
          );
          shownAt = performance.now();
          check.shown(shown.email, shown.findings, final);
        } else if (action === 'hide') {
          trace.push('hide');
          shown = undefined;
          check.hidden();
        } else if (action === 'recheck') {
          trace.push('recheck');
          shownAt = performance.now();
          check.recheck();
        } else if (action === 'stop') {
          // A user can click only what is on screen.
          if (!get('stop').hidden) {
            trace.push('stop');
            get('stop').click();
          }
        }
        const ms =
          action === 'wait'
            ? rng.pick([0, 100, 499, 500, 1_000, 3_000, 9_999, 10_000, 61_000, 63_000])
            : 0;
        if (ms) trace.push(`wait ${ms} ms`);
        await vi.advanceTimersByTimeAsync(ms);
        checkPanel();
      }

      // The model behaves from now on: the shown email must get a final answer, and nothing may
      // keep running (no ticker, no timer) once everything has ended.
      calm = true;
      shownAt = performance.now();
      if (shown) check.recheck();
      await vi.advanceTimersByTimeAsync(1_000_000);
      checkPanel();
      // The check came to rest (with nothing shown, both are empty).
      expect(get('status').textContent).not.toMatch(/waiting|waits|running|loading/i);
      expect(get('overall').textContent).not.toMatch(/^Checking/);
      check.hidden();
      shown = undefined;
      await vi.advanceTimersByTimeAsync(10_000);
      checkPanel();
      expect(vi.getTimerCount(), 'timers left running').toBe(0);
    });
  });
});
