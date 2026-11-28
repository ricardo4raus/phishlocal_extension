// @vitest-environment jsdom
// UI monkey for the whole side panel: the real index.html and main.ts, with Chrome and the model
// replaced by fakes that answer at random. The monkey clicks, types, pastes, picks samples, and
// plays the Gmail tab (emails, "Show original" pages, failures, junk, disconnects), in random
// order and timing. After every step the panel must still keep its promises.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCheckResult, CloudCheckResult, PromptResult, WarmUpResult } from '../../src/ai';
import { RISKS, type Risk } from '../../src/ai/verdict';
import { MESSAGES } from '../../src/i18n';
import type { Language } from '../../src/i18n/languages';
import type { CloudData } from '../../src/privacy/redact';
import { GMAIL_SERVER } from '../../src/raw/gmail-original-page';
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings';
import body from '../../src/sidepanel/index.html?raw';
import {
  forEachCase,
  MONKEY_RUNS,
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
/** What the name search answers in the end phase: by case, names or "could not look". */
let calmNames: string[] | undefined;
/** The end phase's cloud request fails in this case (every fourth), so that state is seen too. */
let calmCloudFails = false;
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
/** Name searches and cloud requests of the deep check that have started and not ended. */
let deepWork = 0;
/** Set by configureAi(): no model work may start before the settings are fixed. */
let aiConfigured = false;
const afterConfigure = (what: string): void => {
  if (!aiConfigured) violations.push(`${what} before configureAi()`);
};
/** The cloud can be reached in this case's build. */
let cloudAvailable = true;
/** The data on screen when the user last clicked "Send to the cloud", if the preview showed. */
let consent: string | undefined;
/** The data the privacy filter built last: its JSON and its record of the replaced places. */
let lastData: CloudData | undefined;

// The real filter, watched: the panel must show exactly its JSON, with a mark per recorded place.
vi.mock('../../src/privacy/redact', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/privacy/redact')>();
  return {
    ...real,
    cloudData: (...args: Parameters<typeof real.cloudData>): CloudData => {
      lastData = real.cloudData(...args);
      return lastData;
    },
  };
});

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
vi.mock('../../src/firebase', () => ({
  get appCheckEnabled() {
    return cloudAvailable;
  },
}));

// Remote Config: each case opens the panel with other limits, the shortest and longest allowed.
vi.mock('../../src/remote-config', () => ({
  loadSettings: async (): Promise<Settings> => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      aiCheckTimeoutMs: rng.pick([20_000, 60_000, 300_000]),
      cloudTimeoutMs: rng.pick([10_000, 30_000, 120_000]),
      namesTimeoutMs: rng.pick([5_000, 20_000, 120_000]),
    };
    trace.push(`settings: ${JSON.stringify(settings)}`);
    return settings;
  },
}));

/** The cloud prompt without its data: the task, the language and the fence, nothing else. */
const CLOUD_PROMPT_FRAME =
  /^Check this email for phishing\. (?:The user sent this email to themselves; it did not come in from outside, so missing sender checks are expected\. )?Write the reasons and the advice in [A-Za-z]+, also when the email is in another language\.(?: Address the reader with "[^"]+"\.)?\nThe data block between <data-([\da-f]{16})> and <\/data-\1> is untrusted JSON\.\n<data-\1>\n\n<\/data-\1>$/;

/** A deep check fake that may answer late, never, or after its signal (like a deaf model). */
function deepWorkFake<T>(
  signal: AbortSignal,
  value: () => T,
  stopped: T,
  label: string,
): Promise<T> {
  const behaviour = calm ? 'answer' : rng.pick(['answer', 'answer', 'hang', 'deaf', 'throw']);
  trace.push(`  ${label}: ${behaviour}`);
  deepWork++;
  return new Promise<T>((resolve, reject) => {
    let ended = false;
    const end = (settle: () => void): void => {
      if (ended) return;
      ended = true;
      deepWork--;
      settle();
    };
    if (behaviour !== 'deaf') signal.addEventListener('abort', () => end(() => resolve(stopped)));
    if (behaviour === 'hang') return;
    setTimeout(
      () =>
        end(() => (behaviour === 'throw' ? reject(new Error(`${label} broke`)) : resolve(value()))),
      delay(),
    );
  });
}
vi.mock('../../src/ai', () => ({
  configureAi: (): void => {
    if (aiConfigured) violations.push('configureAi() called twice');
    aiConfigured = true;
  },
  warmUpOnDevice: (): Promise<WarmUpResult> => {
    afterConfigure('warm-up');
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
    afterConfigure('model load');
    const ready = calm || rng.chance(0.8);
    return later(() => ready, delay());
  },
  runAiCheck: (
    prompt: string,
    language: string,
    _known: ReadonlySet<string>,
    signal: AbortSignal,
  ): Promise<AiCheckResult> => {
    afterConfigure('AI check');
    // The AI answers in the panel's language, whatever Chrome's language.
    if (language !== caseLanguage) violations.push(`AI check in ${language}`);
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
  findNames: (_text: string, language: string, signal: AbortSignal) => {
    afterConfigure('name search');
    if (language !== caseLanguage) violations.push(`name search in ${language}`);
    return deepWorkFake<string[] | undefined>(
      signal,
      () => (calm ? calmNames : rng.pick([['Anna Muster'], [], ['x'.repeat(100)], undefined])),
      undefined,
      'name search',
    );
  },
  runCloudCheck: (prompt: string, signal: AbortSignal): Promise<CloudCheckResult> => {
    afterConfigure('cloud check');
    // Only during a click on "Send to the cloud", once, with exactly the data the preview showed
    // and nothing else: without it, only the fixed instruction lines are left.
    if (!consent || !prompt.includes(consent)) {
      violations.push('cloud request without consent to its data');
    } else if (!CLOUD_PROMPT_FRAME.test(prompt.replace(consent, ''))) {
      violations.push('cloud request with more than the data shown');
    }
    consent = undefined;
    return deepWorkFake<CloudCheckResult>(
      signal,
      () => {
        const answer: CloudCheckResult = {
          ok: true,
          verdict: { risk: rng.pick(RISKS), reasons: ['A cloud reason.'], advice: 'Advice.' },
          durationMs: 1_500,
        };
        const failed: CloudCheckResult = {
          ok: false,
          reason: 'failed',
          detail: 'App Check token invalid',
        };
        return calm
          ? calmCloudFails
            ? failed
            : answer
          : rng.pick<CloudCheckResult>([
              answer,
              failed,
              { ok: false, reason: 'unreadable-answer' },
              { ok: false, reason: 'limit' },
            ]);
      },
      { ok: false, reason: 'stopped' },
      'cloud check',
    );
  },
  runPrompt: (): Promise<PromptResult> => {
    afterConfigure('test prompt');
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
    afterConfigure('download');
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

/** Chrome's language per case, in turn (not from `rng`, so reading it moves no other draw). */
const CHROME_LANGUAGES = ['de-CH', 'en-US', 'it', 'ja'];
let chromeCase = 0;
/**
 * The panel's language per case: the English cases come first (unchanged, so the fixed seed sees
 * what it always saw), then German ones. Texts are compared with the case's dictionary; states
 * named by panel words are counted in English cases only.
 */
let caseLanguage: Language = 'en';

/** English cases, then German ones (per `MONKEY_RUNS`). */
const ENGLISH_CASES = 25;
const GERMAN_CASES = 8;

/** Adds a state named by panel words; only English cases name them the way `expected` does. */
function wordState(name: string): void {
  if (caseLanguage === 'en') reached.add(name);
}

function stubChrome(): void {
  ports = [];
  const chromeLanguage = CHROME_LANGUAGES[chromeCase++ % CHROME_LANGUAGES.length] ?? 'en-US';
  vi.stubGlobal('chrome', {
    runtime: { lastError: undefined },
    i18n: { getUILanguage: () => chromeLanguage },
    tabs: {
      query: async () => [{ id: 7, windowId: 1 }],
      // "How it works" opens the README in a tab; the panel only ever opens that one URL.
      create: async ({ url }: { url: string }) => {
        if (!url.startsWith('https://github.com/')) violations.push(`opened tab ${url}`);
        return { id: 8 };
      },
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

/** The elements a user can see (none of them inside a hidden one). */
const visible = <T extends HTMLElement>(list: Iterable<T>): T[] =>
  [...list].filter((element) => !element.closest('[hidden]'));

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
      'paste-open',
      'sample-load',
      'how-it-works',
      // Not the flag button: it opens its menu without script (jsdom has no popover), and the
      // menu's entries reload the panel, like the language menu in Settings.
      'ai-stop',
      'run',
    ]);
    trace.push(`click #${id}`);
    get(id).click();
  },
  level: () => {
    const radio = get<HTMLInputElement>(`deep-check-level-${rng.pick(['standard', 'high'])}`);
    // A user can click only what is on screen and enabled.
    if (radio.closest('[hidden]') || get<HTMLFieldSetElement>('deep-check-levels').disabled) return;
    trace.push(`choose privacy level ${radio.value}`);
    radio.click();
  },
  deep: () => {
    const id = rng.pick([
      'deep-check-start',
      'deep-check-send',
      'deep-check-cancel',
      'deep-check-stop',
      'deep-check-back',
      'deep-check-show',
    ]);
    const button = get(id);
    // A user can click only what is on screen.
    if (button.closest('[hidden]')) return;
    trace.push(`click #${id}`);
    if (id === 'deep-check-send') consent = get('deep-check-data').textContent ?? '';
    button.click();
    // A click that sent nothing (disabled, or nothing prepared) leaves no consent behind.
    consent = undefined;
  },
  highlight: () => {
    // The consent card's list and the marks in the data: an item (with the pointer or the
    // keyboard), the pointer or the focus on a mark, the arrow keys and Escape from a mark.
    const pre = get('deep-check-data');
    const action = rng.pick(['item', 'item', 'hover', 'focus', 'key']);
    if (action === 'item') {
      const items = visible(
        get('deep-check-removed').querySelectorAll<HTMLElement>('.removed__item'),
      );
      if (items.length === 0) return;
      const item = rng.pick(items);
      const pointer = rng.chance(0.5);
      trace.push(`${pointer ? 'click' : 'press'} removed item ${item.dataset.kind}`);
      if (pointer) item.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      else item.click();
      reached.add('deep: item clicked');
      return;
    }
    const marks = visible(pre.querySelectorAll<HTMLElement>('.redacted'));
    if (action === 'key') {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !pre.contains(focused)) return;
      const key = rng.pick([
        'ArrowRight',
        'ArrowLeft',
        'ArrowDown',
        'ArrowUp',
        'Home',
        'End',
        'Escape',
      ]);
      trace.push(`press ${key} in the data`);
      focused.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      return;
    }
    if (marks.length === 0) return;
    const mark = rng.pick(marks);
    if (action === 'focus') {
      trace.push(`focus mark ${mark.dataset.kind}`);
      mark.focus();
    } else {
      const type = rng.pick(['mouseover', 'mouseover', 'mouseout']);
      trace.push(`${type} mark ${mark.dataset.kind}`);
      mark.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    }
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

// The deep check takes several clicks in a row (prepare, then send), so it gets more turns.
const MOVE_NAMES = [...Object.keys(MOVES), 'deep', 'deep'];

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
  'model-banner-title',
  'model-banner-text',
  'empty-heading',
  'empty-text',
  'strip-subject',
  'strip-domain',
  'strip-name',
  'strip-address',
  'strip-auth-text',
  'flags-count',
  'links-count',
  'links-more-summary',
  'email-findings',
  'email-links',
  'email-links-more',
  'email-notes',
  'email-status',
  'paste-status',
  'ai-overall',
  'ai-status',
  'ai-reasons',
  'ai-advice',
  'ai-source',
  'ai-time',
  'ai-detail',
  'status',
  'progress',
  'deep-check-intro',
  'deep-check-removed-heading',
  'deep-check-removed',
  'deep-check-tip',
  'deep-check-status',
  'deep-check-elapsed',
  'deep-check-overall',
  'deep-check-line',
  'deep-check-reasons',
  'deep-check-advice',
  'deep-check-source',
  'deep-check-time',
  'deep-check-detail',
];

/**
 * A mark reads as the placeholder the filter wrote: a name, number or IBAN, an address (with
 * its domain), or a link with its host. A mark around other marks (a name in an address or a
 * link's host) holds their placeholders too, so only its start, and a link's end, are checked.
 */
function placeholderShaped(mark: HTMLElement): boolean {
  const text = mark.textContent ?? '';
  if (mark.querySelector('.redacted')) {
    return /^\[(?:email|link)/.test(text) && (!text.startsWith('[link') || text.endsWith(']'));
  }
  return /^\[(?:name|number|iban|link(?:: [^\]]*)?)\]$|^\[email\](?:@\S*)?$/.test(text);
}

function checkPanelOnce(): void {
  expect(violations).toEqual([]);
  // Inert only while the settings load, before anything else happens.
  expect(document.querySelector('#app')?.hasAttribute('inert'), 'panel left inert').toBe(false);
  expect(document.querySelector('#panel-starting'), 'start note left').toBeNull();
  // Email content never becomes markup: nothing that loads, runs or links.
  expect(
    document.body.querySelectorAll(
      'img, iframe, frame, script, object, embed, link, style, a, form, svg, math, template',
    ),
  ).toHaveLength(0);
  // The verdict and the email details come and go together, and so do the email section and
  // the empty state (one of the two is always on screen).
  const verdict = get('verdict');
  expect(verdict.hidden, 'verdict and details shown together').toBe(get('email-details').hidden);
  expect(get('email').hidden, 'email section and details differ').toBe(get('email-details').hidden);
  expect(get('empty').hidden, 'empty state and email section both shown or both hidden').toBe(
    !get('email').hidden,
  );
  if (!get('email').hidden) {
    // The strip's domain is the one thing an attacker cannot choose freely; it is never empty.
    expect(get('strip-domain').textContent, 'strip without a domain').not.toBe('');
    wordState(`sender: ${get('strip-auth-text').textContent}`);
    // The red flags section shows exactly the danger and warning rows, and counts them.
    const flagRows = get('email-findings').querySelectorAll('.flag').length;
    expect(get('flags').hidden, 'red flags section').toBe(flagRows === 0);
    expect(get('flags-count').textContent).toBe(String(flagRows));
    expect(get('email-findings').querySelector('.flag.info'), 'a note among the flags').toBeNull();
    if (flagRows > 0) reached.add('flags shown');
    // The links section counts every link; the fold holds the unflagged ones.
    const flagged = get('email-links').children.length;
    const rest = get('email-links-more').children.length;
    expect(get('links').hidden, 'links section').toBe(flagged + rest === 0);
    expect(get('links-count').textContent).toBe(String(flagged + rest));
    expect(get('links-more').hidden, 'links fold').toBe(rest === 0);
    // The count is said once: by the heading with flagged links, by the fold without.
    expect(get('links-heading').hidden, 'links heading').toBe(flagged === 0);
    if (flagged === 0 && rest > 0) {
      expect(get('links-more-summary').textContent).toBe(
        MESSAGES[caseLanguage].email.linksTitle(rest),
      );
    }
    if (flagged > 0) reached.add('flagged links');
    if (rest > 0) reached.add('more links');
  } else {
    expect(get('flags').hidden && get('links').hidden, 'flags or links without an email').toBe(
      true,
    );
    wordState(`empty: ${get('empty-heading').textContent}`);
  }
  // The model banner shows only in the states that need the user.
  const pillState = get('model-pill').dataset.state ?? '';
  reached.add(`model: ${pillState}`);
  // The band says the model is loading: the pill must not say it is ready.
  const loadingText = MESSAGES[caseLanguage].aiCheck.loading(false).slice(0, 12);
  if ((get('ai-status').textContent ?? '').startsWith(loadingText)) {
    expect(pillState, 'pill "ready" while the check waits for the model').not.toBe('ready');
  }
  expect(get('model-banner').hidden, `banner for state ${pillState}`).toBe(
    !['not-downloaded', 'downloading', 'unavailable', 'failed'].includes(pillState),
  );
  if (!verdict.hidden) {
    const risk = verdict.dataset.risk ?? '';
    reached.add(`light ${risk}`);
    wordState(`email: ${(get('email-status').textContent ?? '').slice(0, 30)}`);
    reached.add(
      `AI: ${(get('ai-status').textContent ?? '').replace(/[\d.]+ s/g, 'N s').slice(0, 40)}`,
    );
    const rules = listedRuleRisk();
    const aiStatus = get('ai-status').textContent ?? '';
    if (risk === 'unchecked') expect(rules).toBe('safe');
    else if (risk === 'pending') {
      // "Checking…" hides rule findings only while a check runs and the model is not loading.
      if (rules !== 'safe') {
        const ai = MESSAGES[caseLanguage].aiCheck;
        expect(
          [ai.starting, ai.waitingHeaders, ai.running(false), ai.running(true), ai.waitingPrevious],
          'grey with rule findings, but no check running (or the model loading)',
        ).toContain(aiStatus);
      }
    } else {
      expect(RISKS).toContain(risk);
      expect(LEVEL[risk as Risk], 'verdict below the rules').toBeGreaterThanOrEqual(LEVEL[rules]);
    }
    // A green light only with an AI answer: without one, "no red flags" stays grey.
    if (risk === 'safe')
      expect(get('ai-source').textContent, 'green without AI').toBe(
        MESSAGES[caseLanguage].verdict.sourceDevice,
      );
    const word = get('ai-overall').textContent ?? '';
    wordState(`word: ${word}`);
  }
  // The deep check belongs to the shown email: it comes and goes with the verdict.
  const deep = get('deep-check');
  expect(deep.hidden, 'deep check and verdict shown together').toBe(verdict.hidden);
  if (!deep.hidden) {
    const preview = !get('deep-check-preview').hidden;
    if (preview) reached.add('deep: preview');
    const status = get('deep-check-status').textContent ?? '';
    // The consent card and the offer button alternate; the preview lives inside the card.
    const cardOpen = !get('deep-check-consent').hidden;
    expect(get('deep-check-start').hidden, 'offer and consent card both shown').toBe(cardOpen);
    expect(!preview || cardOpen, 'preview outside the consent card').toBe(true);
    // The tier-2 lists step aside exactly while the consent card is open.
    expect(get('app').dataset.consent === 'open', 'red flags hidden out of step').toBe(cardOpen);
    // The marks in the data: only there, one Tab stop at most, each reading as a placeholder (they
    // come from the filter's record, never from a search of the text). The tooltip only with the
    // data on screen.
    const pre = get('deep-check-data');
    const marks = [...pre.querySelectorAll<HTMLElement>('.redacted')];
    expect(document.querySelectorAll('.redacted'), 'a mark outside the data').toHaveLength(
      marks.length,
    );
    expect(
      pre.querySelectorAll('[tabindex="0"]').length,
      'more than one Tab stop in the data',
    ).toBeLessThanOrEqual(1);
    for (const mark of marks) {
      expect(placeholderShaped(mark), `mark "${mark.textContent}"`).toBe(true);
    }
    if (marks.length > 0) reached.add('deep: marks');
    const tipShown = !get('deep-check-tip').hidden;
    expect(tipShown && get('deep-check-data-panel').hidden, 'tooltip with the data hidden').toBe(
      false,
    );
    if (tipShown) reached.add('deep: tip shown');
    // A preview waiting for consent shows exactly the filter's data, with a mark per recorded
    // place, and a list that matches the level (no names at Standard) and its heading.
    if (preview && !get('deep-check-send').hidden) {
      const standard = get<HTMLInputElement>('deep-check-level-standard').checked;
      const dict = MESSAGES[caseLanguage].deepCheck;
      // The exact data is there whenever Send is: never a Send without data to see.
      expect(pre.textContent, 'Send without data').not.toBe('');
      expect(pre.textContent, "data differs from the filter's").toBe(lastData?.json);
      expect(
        marks.map((mark) => mark.textContent),
        'marks differ from the recorded places',
      ).toEqual(lastData?.spans.map((span) => lastData?.json.slice(span.start, span.end)));
      const items = [...get('deep-check-removed').querySelectorAll<HTMLElement>('.removed__item')];
      const kinds = items.map((item) => item.dataset.kind);
      if (standard) expect(kinds, 'names listed at Standard').not.toContain('name');
      expect(get('deep-check-removed-heading').textContent, 'heading and list differ').toBe(
        items.length > 0
          ? dict.foundAndRemoved
          : dict.nothingToRemove[standard ? 'standard' : 'high'],
      );
      expect(get('deep-check-removed').hidden, 'list hidden or shown out of step').toBe(
        items.length === 0,
      );
      const current = items.filter((item) => item.getAttribute('aria-current') === 'true');
      expect(current.length, 'more than one current item').toBeLessThanOrEqual(1);
      expect(current[0]?.dataset.kind, 'current item and selected kind differ').toBe(
        pre.dataset.selectedKind,
      );
      reached.add(`deep: level ${standard ? 'standard' : 'high'}`);
    }
    // "Looking for names" or "Checking in the cloud" only while that work really runs.
    expect(!/looking|checking in/i.test(status) || deepWork > 0, `stale "${status}"`).toBe(true);
    if (status) wordState(`deep: ${status.slice(0, 25)}`);
    if (preview && !get('deep-check-warning').hidden) reached.add('deep: names may remain');
    if (!get('deep-check-data-panel').hidden) reached.add('deep: data shown');
    const result = get('deep-check-result');
    if (!result.hidden) {
      const risk = result.dataset.risk as Risk;
      reached.add(`deep light ${risk}`);
      expect(LEVEL[risk], 'deep check below the rules').toBeGreaterThanOrEqual(
        LEVEL[listedRuleRisk()],
      );
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
    await forEachCase(ENGLISH_CASES + GERMAN_CASES, async (caseRng, index) => {
      rng = caseRng;
      caseLanguage = index >= ENGLISH_CASES * MONKEY_RUNS ? 'de' : 'en';
      calm = false;
      violations = [];
      trace = [];
      liveRuns = 0;
      modelWork = 0;
      promptWork = 0;
      deepWork = 0;
      aiConfigured = false;
      consent = undefined;
      lastData = undefined;
      cloudAvailable = rng.chance(0.8);
      // The end phase's deep check runs at Standard in even cases and at High in odd ones, where
      // every other name search "could not look": so each of those states is seen for certain.
      calmNames = index % 4 === 1 ? undefined : ['Anna Muster'];
      calmCloudFails = index % 4 === 3;
      vi.clearAllTimers();
      vi.resetModules();
      loadPanel();
      stubChrome();
      // The remembered privacy level would carry over from the last case and break replays.
      localStorage.clear();
      // The panel's language is chosen per case (stubChrome); Chrome's own language rotates.
      localStorage.setItem('phishlocal.language', caseLanguage);
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
      // One Gmail email with confirmed sender checks, so that state is seen in every case and
      // not only when the random messages happen to line up (tab switch: a fresh port).
      onActivated?.({ tabId: 7, windowId: 1 });
      await vi.advanceTimersByTimeAsync(0);
      const port = ports.at(-1);
      // An unreadable Gmail page first, so that empty state is seen in every case too.
      port?.receive({ type: 'unreadable' });
      await vi.advanceTimersByTimeAsync(0);
      checkPanel();
      port?.receive({ type: 'email', key: 'msg-f:calm', email: randomEmail(rng) });
      port?.receive({
        type: 'original',
        key: 'msg-f:calm',
        html: `<pre>Authentication-Results: ${GMAIL_SERVER}; spf=pass; dkim=pass header.d=b.example; dmarc=pass
From: a@b.example
Subject: s

x</pre>`,
      });
      await vi.advanceTimersByTimeAsync(1_000_000);
      checkPanel();
      // One deep check while everything answers, so a whole run (prepare, consent, answer) is seen
      // in every case where it is offered, not only when the random clicks happen to line up.
      const start = get<HTMLButtonElement>('deep-check-start');
      if (!start.closest('[hidden]') && !start.disabled) {
        trace.push('calm: deep check');
        start.click();
        await vi.advanceTimersByTimeAsync(0);
        // The level cards are in the card that just opened: the level of this case, if it differs.
        const wanted = get<HTMLInputElement>(
          `deep-check-level-${index % 2 === 0 ? 'standard' : 'high'}`,
        );
        if (!wanted.checked && !wanted.closest('[hidden]')) {
          trace.push(`calm: privacy level ${wanted.value}`);
          wanted.click();
        }
        await vi.advanceTimersByTimeAsync(1_000_000);
        checkPanel();
        // A look at the first kind in the list and at a mark, so that is seen in every case too.
        const item = get('deep-check-removed').querySelector<HTMLElement>('.removed__item');
        if (item && !item.closest('[hidden]')) {
          trace.push('calm: removed item');
          item.click();
          reached.add('deep: item clicked');
          const mark = get('deep-check-data').querySelector<HTMLElement>('.redacted');
          mark?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          await vi.advanceTimersByTimeAsync(1_000);
          checkPanel();
          await vi.advanceTimersByTimeAsync(1_000_000);
          checkPanel();
        }
        // Cancel once ("Nothing was sent."), then prepare again and send, so both are seen.
        const cancel = get<HTMLButtonElement>('deep-check-cancel');
        if (!cancel.closest('[hidden]')) {
          trace.push('calm: cancel, then again');
          cancel.click();
          await vi.advanceTimersByTimeAsync(0);
          checkPanel();
          start.click();
          await vi.advanceTimersByTimeAsync(1_000_000);
          checkPanel();
        }
        const send = get<HTMLButtonElement>('deep-check-send');
        if (!send.closest('[hidden]') && !send.disabled) {
          consent = get('deep-check-data').textContent ?? '';
          send.click();
          consent = undefined;
          await vi.advanceTimersByTimeAsync(1_000_000);
          checkPanel();
        }
      }
      // One Gmail email whose sender checks could not be loaded, so that status is seen in every
      // case too (the random messages reach it only now and then).
      port?.receive({ type: 'email', key: 'msg-f:calm-2', email: randomEmail(rng) });
      port?.receive({ type: 'original-failed', key: 'msg-f:calm-2', reason: 'timeout' });
      await vi.advanceTimersByTimeAsync(1_000_000);
      checkPanel();
      for (const id of ['run', 'paste-use', 'sample-load', 'model-download']) {
        expect(get<HTMLButtonElement>(id).disabled, `#${id} stuck disabled`).toBe(false);
      }
      expect(get('ai-status').textContent ?? '').not.toMatch(/running|waiting|waits|loading/i);
      // A deep check never hangs the panel: shown buttons work, and nothing is left looking for
      // names or waiting for the cloud (a "deaf" fake may still run, but the panel let it go).
      for (const id of ['deep-check-start', 'deep-check-send', 'deep-check-cancel']) {
        const button = get<HTMLButtonElement>(id);
        const blocked = id === 'deep-check-start' && !cloudAvailable;
        expect(!button.closest('[hidden]') && button.disabled && !blocked, `#${id} stuck`).toBe(
          false,
        );
      }
      expect(get('deep-check-status').textContent ?? '').not.toMatch(
        /running|looking|waiting|checking in/i,
      );
      expect(get('deep-check-elapsed').textContent, 'elapsed time left running').toBe('');
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
          'light unchecked',
          'AI: This looks like phishing.',
          'AI: Not checked by AI.',
          'AI: AI check running',
          'AI: On-device AI loading',
          'email: ',
          'email: Could not load the sender',
          'email: Pasted email.',
          'email: Pasted email with its head',
          'email: Sample loaded',
          'deep: preview',
          'deep: level standard',
          'deep: level high',
          'deep: names may remain',
          'deep: data shown',
          'deep: item clicked',
          'deep: Nothing was sent',
          'deep: The deep check did not',
          'deep light',
          'flags shown',
          'flagged links',
          'more links',
          'sender: Sender confirmed by Gmail',
          'sender: Sender not confirmed',
          'sender: Checking the sender…',
          'empty: Open an email in Gmail',
          'empty: Open Gmail in this tab',
          'empty: Could not read this email',
          'model: ready',
          'model: not-downloaded',
          'model: unavailable',
          'model: failed',
          'model: downloading',
        ];
    const states = [...reached].join('\n');
    for (const state of expected) expect(states, 'state never reached').toContain(state);
  });
});
