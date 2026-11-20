// @vitest-environment jsdom
// UI monkey for the whole side panel: the real index.html and main.ts, with Chrome and the model
// replaced by fakes that answer at random. The monkey clicks, types, pastes, picks samples, and
// plays the Gmail tab (emails, "Show original" pages, failures, junk, disconnects), in random
// order and timing. After every step the panel must still keep its promises.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCheckResult, PromptResult, WarmUpResult } from '../../src/ai';
import { RISKS, type Risk } from '../../src/ai/verdict';
import { GMAIL_SERVER } from '../../src/raw/gmail-original-page';
import body from '../../src/sidepanel/index.html?raw';
import {
  forEachCase,
  MONKEY_TIMEOUT_MS,
  REPLAYING_ONE_CASE,
  randomEmail,
  randomHtml,
  randomRaw,
  randomText,
  type Rng,
} from './random';

vi.setConfig({ testTimeout: MONKEY_TIMEOUT_MS });

/** The fakes read the generator of the case that runs. */
let rng: Rng;
/** In the end phase every fake answers, so the panel must come to rest. */
let calm = false;
/** Broken promises seen inside the fakes or as uncaught errors. */
let violations: string[] = [];
let trace: string[] = [];
/** What the monkey reached across all cases, so a test that idles cannot pass. */
const reached = new Set<string>();
/** AI check runs that have started and not ended: Gemini Nano takes one prompt at a time. */
let liveRuns = 0;
/** Warm-ups and downloads in flight: only then may the model line show a counter. */
let modelWork = 0;
/** Test prompts in flight: only then may the prompt line show a counter. */
let promptWork = 0;

const later = <T>(value: () => T, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(value());
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, ms);
  });

const delay = (): number => (calm ? 0 : rng.pick([0, 0, 10, 600, 2_000, 70_000]));

vi.mock('firebase/ai', () => ({
  InferenceSource: { ON_DEVICE: 'on_device', IN_CLOUD: 'in_cloud' },
}));
vi.mock('../../src/firebase', () => ({ appCheckEnabled: false }));
vi.mock('../../src/ai', () => ({
  warmUpOnDevice: (): Promise<WarmUpResult> => {
    const state = calm
      ? 'ready'
      : rng.pick(['ready', 'ready', 'not-downloaded', 'unavailable', 'throw'] as const);
    trace.push(`  warm-up: ${state}`);
    modelWork++;
    return later(() => {
      modelWork--;
      if (state === 'throw') throw new Error('Chrome refused');
      return state === 'ready' ? { state, durationMs: 1_234 } : { state };
    }, delay());
  },
  ensureModelLoaded: (): Promise<boolean> => {
    const ready = calm || rng.chance(0.8);
    return later(() => ready, delay());
  },
  runAiCheck: (
    prompt: string,
    _language: string,
    _known: ReadonlySet<string>,
    signal: AbortSignal,
  ): Promise<AiCheckResult> => {
    // The prompt is the only thing the model sees: it must hold the email as JSON, nothing else.
    if (!prompt.startsWith('Check this email for phishing.')) violations.push('odd AI prompt');
    const behaviour = calm
      ? 'answer'
      : rng.pick(['answer', 'answer', 'fail', 'unreadable', 'hang']);
    trace.push(`  AI check: ${behaviour}`);
    if (liveRuns > 0) violations.push('a second AI check started while one ran');
    liveRuns++;
    return new Promise<AiCheckResult>((settle) => {
      let ended = false;
      const resolve = (result: AiCheckResult): void => {
        if (ended) return;
        ended = true;
        liveRuns--;
        settle(result);
      };
      signal.addEventListener('abort', () =>
        resolve({ ok: false, reason: 'stopped', detail: 'the model had written 0 characters' }),
      );
      if (behaviour === 'hang') return;
      setTimeout(() => {
        if (behaviour === 'answer') {
          resolve({
            ok: true,
            verdict: { risk: rng.pick(RISKS), reasons: ['A reason.'], advice: 'Some advice.' },
            durationMs: 900,
          });
        } else if (behaviour === 'fail') {
          resolve({ ok: false, reason: 'failed', detail: 'Session crashed' });
        } else {
          resolve({ ok: false, reason: 'unreadable-answer' });
        }
      }, delay());
    });
  },
  runPrompt: (): Promise<PromptResult> => {
    const fails = !calm && rng.chance(0.3);
    promptWork++;
    return later(() => {
      promptWork--;
      if (fails) throw new Error('The cloud said no');
      return { text: 'An answer.', source: undefined, durationMs: 800 };
    }, delay());
  },
  downloadOnDeviceModel: (
    _language: string,
    onProgress: (loaded: number) => void,
  ): Promise<WarmUpResult> => {
    const steps = rng.int(0, 4);
    for (let step = 1; step <= steps; step++)
      setTimeout(() => onProgress(step / steps), step * 100);
    // Chrome may report progress after the download has ended.
    setTimeout(() => onProgress(0.5), 10_000);
    const result = calm ? 'ready' : rng.pick(['ready', 'unavailable', 'throw'] as const);
    modelWork++;
    return later(() => {
      modelWork--;
      if (result === 'throw') throw new Error('Download failed');
      return result === 'ready' ? { state: result, durationMs: 1 } : { state: result };
    }, 1_000);
  },
}));

/* ------------------------------------------------------------------------------------------------
 * Chrome: the active tab and the port to the Gmail content script.
 * --------------------------------------------------------------------------------------------- */

interface FakePort {
  sent: unknown[];
  receive(message: unknown): void;
  close(): void;
}

let ports: FakePort[] = [];
let onActivated: ((info: { tabId: number; windowId: number }) => void) | undefined;
let onUpdated: ((tabId: number, change: { status?: string }) => void) | undefined;

function stubChrome(): void {
  ports = [];
  vi.stubGlobal('chrome', {
    runtime: { lastError: undefined },
    i18n: { getUILanguage: () => rng.pick(['de-CH', 'en-US', 'it', 'ja']) },
    tabs: {
      query: async () => [{ id: 7, windowId: 1 }],
      connect: () => {
        if (!calm && rng.chance(0.1)) throw new Error('Cannot access a chrome:// URL');
        let onMessage: ((message: unknown) => void) | undefined;
        let onDisconnect: (() => void) | undefined;
        let open = true;
        const port: FakePort & Record<string, unknown> = {
          sent: [],
          postMessage: (message: unknown) => port.sent.push(message),
          disconnect: () => {
            open = false;
          },
          onMessage: { addListener: (listener: typeof onMessage) => (onMessage = listener) },
          onDisconnect: {
            addListener: (listener: typeof onDisconnect) => (onDisconnect = listener),
          },
          receive: (message) => {
            if (open) onMessage?.(message);
          },
          close: () => {
            if (!open) return;
            open = false;
            onDisconnect?.();
          },
        };
        ports.push(port);
        return port;
      },
      onActivated: { addListener: (listener: typeof onActivated) => (onActivated = listener) },
      onUpdated: { addListener: (listener: typeof onUpdated) => (onUpdated = listener) },
    },
  });
}

/* ------------------------------------------------------------------------------------------------
 * The monkey's moves.
 * --------------------------------------------------------------------------------------------- */

const get = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const KEYS = ['msg-f:1', 'msg-f:2', 'msg-f:3'];

/** A message from the Gmail tab, valid or not. */
function gmailMessage(): unknown {
  const key = rng.pick(KEYS);
  return rng.pick([
    () => ({ type: 'email', key, email: randomEmail(rng) }),
    () => ({ type: 'email', key, email: randomEmail(rng) }),
    () => ({
      type: 'original',
      key,
      html: `<pre>Authentication-Results: ${rng.pick([GMAIL_SERVER, 'evil.example'])}; dmarc=${rng.pick(['pass', 'fail'])}\r\n${randomRaw(rng)}</pre>`,
    }),
    () => ({ type: 'original', key, html: randomHtml(rng) }),
    () => ({ type: 'original-failed', key, reason: rng.pick(['timeout', 'no-account-key', 'x']) }),
    () => ({ type: 'no-email' }),
    () => ({ type: 'unreadable' }),
    () => ({ type: 'email', key, email: { sender: 'junk' } }),
    () => rng.pick([null, 'email', 42, { type: 'scan' }]),
  ])();
}

function typeInto(id: string, text: string): void {
  const field = get<HTMLInputElement | HTMLTextAreaElement>(id);
  field.value = text;
  field.dispatchEvent(new Event('input'));
}

function pasteInto(text: string, html: string): void {
  const event = new Event('paste');
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/html' ? html : text) },
  });
  get('paste-text').dispatchEvent(event);
  typeInto('paste-text', text);
}

const MOVES: Record<string, () => void> = {
  click: () => {
    const id = rng.pick([
      'model-download',
      'read-email',
      'paste-use',
      'paste-use',
      'paste-clear',
      'sample-load',
      'run',
    ]);
    trace.push(`click #${id}`);
    get(id).click();
  },
  type: () => {
    const id = rng.pick(['paste-sender', 'paste-subject', 'paste-text', 'paste-text', 'prompt']);
    const text = rng.pick([
      () => randomText(rng, 20),
      () => '',
      () => randomRaw(rng),
      () => `Received: from x\r\nFrom: a@b.example\r\nSubject: s\r\n\r\n${randomText(rng, 5)}`,
    ])();
    trace.push(`type into #${id} (${text.length} characters)`);
    typeInto(id, text);
  },
  paste: () => {
    trace.push('paste');
    pasteInto(randomText(rng, 30), randomHtml(rng));
  },
  sample: () => {
    const select = get<HTMLSelectElement>('sample-select');
    select.selectedIndex = rng.int(0, select.options.length - 1);
    trace.push(`pick sample ${select.value || '(none)'}`);
  },
  cloud: () => {
    get<HTMLInputElement>('force-cloud').click();
  },
  gmail: () => {
    const port = ports.at(-1);
    const message = gmailMessage();
    trace.push(`gmail sends ${JSON.stringify(message)?.slice(0, 80)}`);
    port?.receive(message);
  },
  disconnect: () => {
    trace.push('gmail tab disconnects');
    ports.at(-1)?.close();
  },
  tabs: () => {
    trace.push('tab switch or reload');
    if (rng.chance(0.5)) onActivated?.({ tabId: 7, windowId: 1 });
    else onUpdated?.(7, { status: 'complete' });
  },
};

const MOVE_NAMES = Object.keys(MOVES);

/* ------------------------------------------------------------------------------------------------
 * What the panel promises.
 * --------------------------------------------------------------------------------------------- */

const LEVEL: Record<Risk, number> = { safe: 0, suspicious: 1, dangerous: 2 };

/** The rules' risk as the findings list shows it. */
function listedRuleRisk(): Risk {
  const list = get('email-findings');
  if (list.querySelector('.finding.danger')) return 'dangerous';
  if (list.querySelector('.finding.warning')) return 'suspicious';
  return 'safe';
}

const STATUS_IDS = [
  'model-status',
  'model-progress',
  'email-status',
  'ai-overall',
  'ai-status',
  'ai-reasons',
  'ai-advice',
  'status',
  'progress',
];

function checkPanelOnce(): void {
  expect(violations).toEqual([]);
  // Email content never becomes markup: nothing that loads, runs or links.
  expect(
    document.body.querySelectorAll(
      'img, iframe, frame, script, object, embed, link, style, a, form, svg, math, template',
    ),
  ).toHaveLength(0);
  // The verdict and the email details come and go together.
  const verdict = get('verdict');
  expect(verdict.hidden, 'verdict and details shown together').toBe(get('email-details').hidden);
  if (!verdict.hidden) {
    const risk = verdict.dataset.risk ?? '';
    reached.add(`light ${risk}`);
    reached.add(`email: ${(get('email-status').textContent ?? '').slice(0, 30)}`);
    reached.add(
      `AI: ${(get('ai-status').textContent ?? '').replace(/[\d.]+ s/g, 'N s').slice(0, 40)}`,
    );
    const rules = listedRuleRisk();
    if (risk === 'pending') expect(rules).toBe('safe');
    else {
      expect(RISKS).toContain(risk);
      expect(LEVEL[risk as Risk], 'verdict below the rules').toBeGreaterThanOrEqual(LEVEL[rules]);
    }
  }
  // Counters run only while something is loading: no stale seconds or download percentage.
  if (modelWork === 0) expect(get('model-progress').textContent, '#model-progress idle').toBe('');
  if (promptWork === 0) expect(get('progress').textContent, '#progress idle').toBe('');
  for (const id of STATUS_IDS) {
    expect(get(id).textContent, `#${id}`).not.toMatch(/undefined|NaN|\[object |null/);
  }
  // The panel only ever asks the content script to scan.
  for (const port of ports) {
    for (const message of port.sent) expect(message).toEqual({ type: 'scan' });
  }
}

function checkPanel(): void {
  try {
    checkPanelOnce();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const steps = trace.slice(-30).join('\n');
    throw new Error(`${message}\nLast steps:\n${steps}`, { cause: error });
  }
}

/**
 * Loads the real panel page. Parsed by jsdom (innerHTML runs no scripts and loads nothing), then
 * the script tag is removed through the DOM, never with a regex: main.ts is imported by the test.
 */
function loadPanel(): void {
  document.documentElement.innerHTML = body;
  for (const element of document.querySelectorAll('script, link')) element.remove();
}

const onError = (event: ErrorEvent): void => {
  violations.push(`uncaught: ${event.message}`);
};

beforeEach(() => {
  vi.useFakeTimers();
  window.addEventListener('error', onError);
});

afterEach(() => {
  window.removeEventListener('error', onError);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('monkey: side panel', () => {
  it('keeps its promises whatever the user, Gmail and the model do', async () => {
    await forEachCase(25, async (caseRng) => {
      rng = caseRng;
      calm = false;
      violations = [];
      trace = [];
      liveRuns = 0;
      modelWork = 0;
      promptWork = 0;
      vi.clearAllTimers();
      vi.resetModules();
      loadPanel();
      stubChrome();
      await import('../../src/sidepanel/main');
      await vi.advanceTimersByTimeAsync(0);
      checkPanel();

      for (let step = 0; step < 60; step++) {
        if (rng.chance(0.75)) MOVES[rng.pick(MOVE_NAMES)]?.();
        const ms = rng.pick([0, 0, 50, 500, 600, 3_000, 70_000]);
        if (ms) trace.push(`wait ${ms} ms`);
        await vi.advanceTimersByTimeAsync(ms);
        checkPanel();
      }

      // Everything answers from now on: the panel must come to rest, with no button stuck.
      calm = true;
      get('read-email').click();
      await vi.advanceTimersByTimeAsync(1_000_000);
      checkPanel();
      for (const id of ['run', 'paste-use', 'sample-load', 'model-download']) {
        expect(get<HTMLButtonElement>(id).disabled, `#${id} stuck disabled`).toBe(false);
      }
      expect(get('ai-status').textContent ?? '').not.toMatch(/running|waiting|waits|loading/i);
      // Nothing keeps running: no ticker, no counter, no forgotten timeout.
      expect(vi.getTimerCount(), 'timers left running').toBe(0);
    });
    // A monkey that never got anywhere proves nothing: the main states must have been reached.
    // (Not while one case is replayed.)
    const expected = REPLAYING_ONE_CASE
      ? []
      : [
          'light pending',
          'light safe',
          'light suspicious',
          'light dangerous',
          'AI: On-device (Gemini Nano)',
          'AI: The AI check failed',
          'AI: On-device model still loading',
          'email: Checked automatically',
          'email: Pasted email',
          'email: Raw email read',
          'email: Sample loaded',
        ];
    const states = [...reached].join('\n');
    for (const state of expected) expect(states, 'state never reached').toContain(state);
  });
});
