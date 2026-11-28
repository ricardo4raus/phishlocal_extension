// @vitest-environment jsdom
// The cloud deep check in the side panel, with the model, Nano's name finder and the cloud
// replaced by fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudCheckResult } from '../src/ai';
import type { Email } from '../src/email';
import type { CloudData, RedactedKind, RedactedSpan } from '../src/privacy/redact';
import type { Finding } from '../src/rules';
import { HEADERS_WAIT_MS, STOP_GRACE_MS } from '../src/sidepanel/ai-view';
import {
  CLOUD_LIMIT_EXTRA_MS,
  createDeepCheck,
  type DeepCheck,
  type DeepCheckDeps,
  removedItems,
  renderRedacted,
  TIP_DELAY_MS,
  TIP_HIDE_MS,
  TIP_MAX_CHARS,
  TIP_QUICK_MS,
  TIP_WARM_MS,
} from '../src/sidepanel/deep-check-view';
import { SENT_TO_SELF_NOTE } from '../src/ai/prompt';
import { DEFAULT_SETTINGS } from '../src/settings';

const NAMES_TIMEOUT_MS = DEFAULT_SETTINGS.namesTimeoutMs;
const CLOUD_LIMIT_MS = DEFAULT_SETTINGS.cloudTimeoutMs + CLOUD_LIMIT_EXTRA_MS;

/**
 * The real privacy filter, watched: `last` is the data the panel got (its JSON and its record of
 * replaced places). `alter` changes that data for the few tests that need a made-up record (an
 * original too long for the tooltip); every other test runs on the filter's own spans.
 */
const supplied = vi.hoisted(() => ({
  alter: undefined as ((data: CloudData) => CloudData) | undefined,
  last: undefined as CloudData | undefined,
}));

vi.mock('../src/privacy/redact', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/privacy/redact')>();
  return {
    ...real,
    cloudData: (...args: Parameters<typeof real.cloudData>): CloudData => {
      const data = real.cloudData(...args);
      supplied.last = supplied.alter ? supplied.alter(data) : data;
      return supplied.last;
    },
  };
});

/** The personal data in the fixture email, as the filter records it (the tooltips show it). */
const ORIGINALS = {
  name: 'Anna Muster',
  address: 'anna.muster@mail.example',
  iban: 'CH93 0076 2011 6238 5295 7',
  phone: '+41 79 123 45 67',
};

const email: Email = {
  sender: { name: 'Anna Muster', address: 'anna.muster@mail.example' },
  subject: 'Invoice',
  bodyText: 'Dear Anna Muster, pay to CH93 0076 2011 6238 5295 7 or call +41 79 123 45 67.',
  links: [{ text: 'Pay now', href: 'https://evil.example/pay?user=anna' }],
  truncated: false,
};

const other: Email = { ...email, subject: 'Another one' };

const danger: Finding = { rule: 'dangerous-link', severity: 'danger', message: 'x', evidence: [] };

const BUTTONS = ['start', 'stop', 'send', 'cancel', 'back', 'show'] as const;
const IDS = [
  'section',
  'intro',
  ...BUTTONS,
  'consent',
  'levels',
  'preview',
  'removedHeading',
  'removed',
  'warning',
  'dataPanel',
  'data',
  'tip',
  'nothingYet',
  'status',
  'elapsed',
  'result',
  'overall',
  'line',
  'reasons',
  'advice',
  'source',
  'time',
  'detail',
] as const;
type Id = (typeof IDS)[number];

const get = (id: Id) => document.getElementById(id) as HTMLElement;
const text = (id: Id): string => get(id).textContent ?? '';
const click = (id: (typeof BUTTONS)[number]): void => get(id).click();

let nameCalls: { text: string; signal: AbortSignal; resolve: (names?: string[]) => void }[];
let runs: { prompt: string; signal: AbortSignal; resolve: (result: CloudCheckResult) => void }[];
let check: DeepCheck;

/** A fresh panel (new elements, so no listeners of an earlier instance) and a deep check on it. */
function create(deps: Partial<DeepCheckDeps> = {}): DeepCheck {
  const elements = IDS.map((id) => {
    const tag = (BUTTONS as readonly string[]).includes(id)
      ? 'button'
      : id === 'reasons' || id === 'removed'
        ? 'ul'
        : id === 'levels'
          ? 'fieldset'
          : id === 'removedHeading' || id === 'nothingYet'
            ? 'p'
            : id === 'data'
              ? 'pre'
              : id === 'tip'
                ? 'span'
                : 'div';
    const element = document.createElement(tag);
    element.id = id;
    // As in index.html: the tooltip is hidden and strikes its text through.
    if (id === 'tip') {
      element.setAttribute('role', 'tooltip');
      element.hidden = true;
      element.append(document.createElement('s'));
    }
    // As in index.html: one card with a radio per level; a click on the card chooses it.
    if (element instanceof HTMLFieldSetElement) {
      for (const value of ['standard', 'high']) {
        const card = document.createElement('div');
        card.dataset.level = value;
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'deep-check-level';
        radio.value = value;
        radio.id = `level-${value}`;
        const label = document.createElement('label');
        label.htmlFor = radio.id;
        label.textContent = value;
        const list = document.createElement('ul');
        list.id = `list-${value}`;
        card.append(radio, label, list);
        element.append(card);
      }
    }
    // As in index.html: the data and the result can take the focus.
    if (id === 'data') element.tabIndex = 0;
    if (id === 'result' || id === 'consent' || id === 'preview') element.tabIndex = -1;
    return element;
  });
  // As in index.html, the section holds everything else.
  const [section, ...inside] = elements;
  section?.append(...inside);
  document.body.replaceChildren(...(section ? [section] : []));
  return createDeepCheck(
    {
      section: get('section'),
      start: get('start') as HTMLButtonElement,
      intro: get('intro'),
      consent: get('consent'),
      back: get('back') as HTMLButtonElement,
      levels: get('levels') as HTMLFieldSetElement,
      preview: get('preview'),
      removedHeading: get('removedHeading'),
      removed: get('removed'),
      warning: get('warning'),
      show: get('show') as HTMLButtonElement,
      dataPanel: get('dataPanel'),
      data: get('data'),
      tip: get('tip'),
      nothingYet: get('nothingYet'),
      send: get('send') as HTMLButtonElement,
      cancel: get('cancel') as HTMLButtonElement,
      status: get('status'),
      elapsed: get('elapsed'),
      stop: get('stop') as HTMLButtonElement,
      result: get('result'),
      overall: get('overall'),
      line: get('line'),
      reasons: get('reasons') as HTMLUListElement,
      advice: get('advice'),
      source: get('source'),
      time: get('time'),
      detail: get('detail'),
    },
    {
      available: true,
      panelLanguage: () => 'en-GB',
      modelReady: async () => true,
      findNames: (searched, _language, signal) =>
        new Promise((resolve) => nameCalls.push({ text: searched, signal, resolve })),
      run: (prompt, signal) =>
        new Promise((resolve) => {
          runs.push({ prompt, signal, resolve });
          signal.addEventListener('abort', () => resolve({ ok: false, reason: 'stopped' }));
        }),
      namesTimeoutMs: NAMES_TIMEOUT_MS,
      cloudTimeoutMs: DEFAULT_SETTINGS.cloudTimeoutMs,
      // Most tests here are about the name search, which only "high" runs.
      savedLevel: () => 'high',
      ...deps,
    },
  );
}

const answer = (risk: 'safe' | 'suspicious' | 'dangerous', reasons = ['Cloud reason.']) =>
  ({ ok: true, verdict: { risk, reasons, advice: 'Cloud advice.' }, durationMs: 2_000 }) as const;

/** Prepares the preview with the names Nano "found". */
async function prepare(names: string[] | undefined = ['Anna Muster']): Promise<void> {
  click('start');
  await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
  nameCalls[0]?.resolve(names);
  await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
}

beforeEach(() => {
  vi.useFakeTimers();
  nameCalls = [];
  runs = [];
  check = create();
});

afterEach(() => {
  supplied.alter = undefined;
  supplied.last = undefined;
  vi.useRealTimers();
});

describe('the deep check', () => {
  it('sends nothing until the user agrees, then exactly the data shown, once', async () => {
    check.shown(email, []);
    expect(get('section').hidden).toBe(false);
    await prepare();
    // Nano read the email's text on the device.
    expect(nameCalls[0]?.text).toContain('Dear Anna Muster');
    const shownData = text('data');
    expect(shownData).not.toMatch(/anna|CH93|123 45 67|pay\?user/i);
    expect(shownData).toContain('"goes_to": "evil.example"');
    expect(text('removed')).toContain('2 names');
    // The focus lands on the preview, never on Send: a second Enter must not send unread data.
    expect(document.activeElement).toBe(get('preview'));
    // The exact data is one click away, and that click opens it.
    expect(get('dataPanel').hidden).toBe(true);
    expect(get('show').getAttribute('aria-expanded')).toBe('false');
    click('show');
    expect(get('dataPanel').hidden).toBe(false);
    expect(get('show').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(get('data'));
    expect(runs).toHaveLength(0);

    click('send');
    click('send');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.prompt).toContain(shownData);
    runs[0]?.resolve(answer('dangerous'));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    expect(text('overall')).toBe('Deep check: Dangerous');
    expect(text('line')).toBe('This looks like phishing.');
    expect(text('source')).toBe('Checked in the cloud');
    expect(text('time')).toBe('Done in 2.0 s');
    expect(get('result').dataset.risk).toBe('dangerous');
    expect(text('advice')).toBe('Cloud advice.');
    // No status line next to the result (fresh-Chrome test).
    expect(text('status')).toBe('');
    expect(get('send').hidden).toBe(true);
    expect(document.activeElement).toBe(get('result'));
    // The data stays as the record of what was sent.
    expect(text('data')).toBe(shownData);
    // "Back to the result" closes the card (the record goes with it) and keeps the result; the
    // offer is back.
    click('back');
    expect(get('consent').hidden).toBe(true);
    expect(get('preview').hidden).toBe(true);
    expect(get('result').hidden).toBe(false);
    expect(get('start').hidden).toBe(false);
    expect(document.activeElement).toBe(get('start'));
  });

  it('opens the consent card in place and tells the panel, and Back cancels an open preview', async () => {
    const opened: boolean[] = [];
    check = create({ onConsent: (open) => opened.push(open) });
    check.shown(email, []);
    expect(get('consent').hidden).toBe(true);
    await prepare();
    expect(get('consent').hidden).toBe(false);
    expect(get('start').hidden).toBe(true);
    expect(opened).toEqual([true]);
    click('back');
    expect(get('consent').hidden).toBe(true);
    expect(text('status')).toBe('Nothing was sent.');
    expect(opened).toEqual([true, false]);
    click('send');
    expect(runs).toHaveLength(0);
  });

  it('sends nothing when the user cancels', async () => {
    check.shown(email, []);
    await prepare();
    click('cancel');
    expect(get('preview').hidden).toBe(true);
    expect(text('status')).toBe('Nothing was sent.');
    click('send');
    expect(runs).toHaveLength(0);
  });

  it('waits for the sender checks of a Gmail email', async () => {
    check.shown(email, [], false);
    expect((get('start') as HTMLButtonElement).disabled).toBe(true);
    expect(text('intro')).toContain('Waiting for the sender checks');
    check.shown(email, [], true);
    expect((get('start') as HTMLButtonElement).disabled).toBe(false);
    // Headers that never come: like the on-device check, it goes on without them.
    check.shown(other, [], false);
    expect((get('start') as HTMLButtonElement).disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(HEADERS_WAIT_MS);
    expect((get('start') as HTMLButtonElement).disabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the name search when the email is left, and drops its late answer', async () => {
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
    check.shown(other, []);
    expect(nameCalls[0]?.signal.aborted).toBe(true);
    expect(text('status')).toContain('Nothing was sent');
    nameCalls[0]?.resolve(['Anna Muster']);
    await vi.advanceTimersByTimeAsync(0);
    expect(get('preview').hidden).toBe(true);
  });

  it('leaves no note under the next email after a finished deep check', async () => {
    // Fresh-Chrome test: "the deep check result was cleared" stayed under the next email's button.
    check.shown(email, []);
    await prepare();
    click('send');
    runs[0]?.resolve(answer('dangerous'));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    check.shown(other, []);
    expect(get('result').hidden).toBe(true);
    expect(text('status')).toBe('');
  });

  it('says so when the email changes while the data is on its way', async () => {
    // Found in review: Gmail showing the email again wiped the record without a word. Gmail does
    // it in two steps (round 2): first without headers, then with them.
    const withHeaders: Email = { ...email, headers: { replyTo: [] } };
    check.shown(withHeaders, []);
    await prepare();
    click('send');
    expect(document.activeElement).toBe(get('stop'));
    check.shown(email, [], false);
    check.shown(withHeaders, [], true);
    expect(runs[0]?.signal.aborted).toBe(true);
    expect(text('status')).toBe(
      'The email changed while the deep check ran: its data had been sent, its answer was dropped.',
    );
    // The focus does not stay on the hidden Stop button.
    expect(document.activeElement).toBe(get('start'));
    await vi.advanceTimersByTimeAsync(0);
    expect(get('result').hidden).toBe(true);
    check.hidden();
    expect(get('section').hidden).toBe(true);
  });

  it('keeps the preview when Gmail shows the same email again', async () => {
    check.shown(email, []);
    await prepare();
    check.shown({ ...email }, []);
    expect(get('preview').hidden).toBe(false);
    click('send');
    expect(runs).toHaveLength(1);
  });

  it('keeps the focus on the level cards when a keyboard user changes the level', async () => {
    check = create({ savedLevel: () => 'standard' });
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    radio('high').focus();
    choose('high');
    await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
    expect(document.activeElement).toBe(radio('high'));
    nameCalls[0]?.resolve([]);
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(document.activeElement).toBe(radio('high'));
  });

  it("shows the card's text without technical terms", async () => {
    check.shown(email, []);
    await prepare();
    expect(get('consent').textContent).not.toMatch(/\b(rule|DKIM|DMARC|SPF|JSON)\b/);
  });

  it('recovers when building the data throws', async () => {
    const broken = vi.spyOn(console, 'error').mockImplementation(() => {});
    check = create({
      savedLevel: () => 'standard',
      // cloudData() reads the email: a hostile shape makes it throw.
      panelLanguage: () => 'en',
    });
    check.shown({ ...email, links: undefined as unknown as Email['links'] }, []);
    click('start');
    await vi.advanceTimersByTimeAsync(0);
    expect(text('status')).toBe('The deep check could not prepare its data. Nothing was sent.');
    expect(get('consent').hidden).toBe(true);
    expect(levelsDisabled()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    broken.mockRestore();
  });

  it('keeps the card open while the data is on its way: Back is disabled, Stop is the way out', async () => {
    check.shown(email, []);
    await prepare();
    click('send');
    expect((get('back') as HTMLButtonElement).disabled).toBe(true);
    click('back');
    expect(get('consent').hidden).toBe(false);
    expect(get('preview').hidden).toBe(false);
    runs[0]?.resolve(answer('safe'));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    expect((get('back') as HTMLButtonElement).disabled).toBe(false);
  });

  it('can be stopped while it looks for names and while it sends', async () => {
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
    expect(get('stop').hidden).toBe(false);
    click('stop');
    expect(nameCalls[0]?.signal.aborted).toBe(true);
    expect(text('status')).toBe('Stopped. Nothing was sent.');

    nameCalls = [];
    await prepare();
    click('send');
    click('stop');
    expect(runs[0]?.signal.aborted).toBe(true);
    await vi.waitFor(() => expect(text('status')).toContain('The deep check was stopped'));
    expect(get('stop').hidden).toBe(true);
  });

  it('does not count the model load against the name search', async () => {
    // Found in review: a model load of minutes ran inside the 20 s limit.
    let loaded: ((ready: boolean) => void) | undefined;
    check = create({ modelReady: () => new Promise((resolve) => (loaded = resolve)) });
    check.shown(email, []);
    click('start');
    expect(text('status')).toBe('Waiting for the on-device AI…');
    expect(get('stop').hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(NAMES_TIMEOUT_MS * 10);
    loaded?.(true);
    await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
    expect(nameCalls[0]?.signal.aborted).toBe(false);
    nameCalls[0]?.resolve([]);
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(get('warning').hidden).toBe(true);
  });

  it('removes the sender name and warns when Nano could not look for names', async () => {
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(NAMES_TIMEOUT_MS);
    expect(nameCalls[0]?.signal.aborted).toBe(true);
    // A late answer after the time limit is not trusted to be complete.
    nameCalls[0]?.resolve([]);
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(get('warning').hidden).toBe(false);
    expect(JSON.parse(text('data'))).toMatchObject({ email: { from: { name: '[name]' } } });
  });

  it('warns when the model is not ready, without asking it', async () => {
    check = create({ modelReady: async () => false });
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(nameCalls).toHaveLength(0);
    expect(get('warning').hidden).toBe(false);
  });

  it('never waits forever, also not for work that ignores its stop signal', async () => {
    check = create({
      findNames: () => new Promise(() => {}),
      run: (prompt, signal) => {
        runs.push({ prompt, signal, resolve: () => {} });
        return new Promise(() => {});
      },
    });
    check.shown(email, []);
    click('start');
    await vi.advanceTimersByTimeAsync(NAMES_TIMEOUT_MS + STOP_GRACE_MS);
    expect(get('preview').hidden).toBe(false);
    expect(get('warning').hidden).toBe(false);
    click('send');
    await vi.advanceTimersByTimeAsync(CLOUD_LIMIT_MS);
    expect(runs[0]?.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS);
    expect(text('status')).toMatch(/^The deep check did not work\./);
    expect(text('detail')).toBe(
      `The cloud request failed: no answer within ${CLOUD_LIMIT_MS / 1000} s.`,
    );
    // Nothing left running once zero-delay tasks have run.
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the time limits it is given (from Remote Config)', async () => {
    check = create({
      namesTimeoutMs: 5_000,
      cloudTimeoutMs: 10_000,
      findNames: () => new Promise(() => {}),
      run: (prompt, signal) => {
        runs.push({ prompt, signal, resolve: () => {} });
        return new Promise(() => {});
      },
    });
    check.shown(email, []);
    click('start');
    await vi.advanceTimersByTimeAsync(5_000 + STOP_GRACE_MS);
    expect(get('preview').hidden).toBe(false);
    click('send');
    await vi.advanceTimersByTimeAsync(20_000 + STOP_GRACE_MS);
    expect(text('detail')).toBe('The cloud request failed: no answer within 20 s.');
  });

  it('treats a throwing name finder like one that could not look', async () => {
    check = create({
      findNames: () => {
        throw new Error('broken');
      },
    });
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(get('warning').hidden).toBe(false);
  });

  it('keeps the rules as the lower limit', async () => {
    check.shown(email, [danger]);
    await prepare();
    click('send');
    runs[0]?.resolve(answer('safe'));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    expect(text('overall')).toBe('Deep check: Dangerous');
    expect(text('detail')).toMatch(
      /^The cloud AI said: no signs of phishing; the basic checks found more, so their verdict stands\./,
    );
    expect(text('advice')).not.toBe('Cloud advice.');
  });

  it('gives its own reasons when the cloud AI alone is overruled, and its points as details', async () => {
    check.shown({ ...email, links: [] }, []);
    await prepare();
    click('send');
    runs[0]?.resolve(answer('suspicious', ['The subject is empty.']));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    expect(text('overall')).toBe('Deep check: Looks safe');
    expect([...get('reasons').children].map((item) => item.textContent)).toEqual([
      'No links and no request: there is nothing to fall for.',
      'The basic checks found no warning signs.',
    ]);
    expect(text('detail')).toMatch(/Its points: The subject is empty\./);
  });

  it('tells the cloud AI in its task when the email was sent to yourself', async () => {
    check.shown({ ...email, headers: { replyTo: [], sentToSelf: true } }, []);
    await prepare();
    click('send');
    expect(runs[0]?.prompt.split(String.fromCodePoint(10))[0]).toContain(SENT_TO_SELF_NOTE);
  });

  it('keeps at least "suspicious" when the rules failed', async () => {
    check.shown(email, undefined);
    await prepare();
    click('send');
    runs[0]?.resolve(answer('safe'));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    expect(get('result').dataset.risk).toBe('suspicious');
  });

  it('shows reasons as text, never as markup', async () => {
    check.shown(email, []);
    await prepare();
    click('send');
    runs[0]?.resolve(answer('suspicious', ['<img src=x onerror=alert(1)>']));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    expect(get('reasons').querySelector('img')).toBeNull();
    expect(text('reasons')).toBe('<img src=x onerror=alert(1)>');
  });

  it('says when the cloud failed, and lets the user prepare again', async () => {
    check.shown(email, []);
    await prepare();
    click('send');
    runs[0]?.resolve({ ok: false, reason: 'failed', detail: 'the cloud refused the request' });
    await vi.waitFor(() => expect(text('status')).toContain('did not work'));
    // The cloud's own words are tier 3.
    expect(text('detail')).toBe('The cloud request failed: the cloud refused the request.');
    expect(get('result').hidden).toBe(true);
    // The card stays open with the data: the user can send again or go back.
    expect(get('consent').hidden).toBe(false);
    expect(get('send').hidden).toBe(false);
    click('send');
    expect(runs).toHaveLength(2);
  });

  it('says when the daily limit is reached, and that nothing was sent', async () => {
    check.shown(email, []);
    await prepare();
    click('send');
    runs[0]?.resolve({ ok: false, reason: 'limit' });
    await vi.waitFor(() => expect(text('status')).toContain("reached today's limit"));
    expect(text('status')).toContain('Nothing was sent');
    expect(text('detail')).toBe('');
    expect(get('result').hidden).toBe(true);
    expect(get('send').hidden).toBe(false);
  });

  it('cannot start where the cloud is not available', () => {
    check = create({ available: false });
    check.shown(email, []);
    expect((get('start') as HTMLButtonElement).disabled).toBe(true);
    expect(text('intro')).toContain('Not available in this build');
    click('start');
    expect(nameCalls).toHaveLength(0);
  });

  it('recommends itself where on-device answers are experimental', () => {
    check = create({ panelLanguage: () => 'it-IT' });
    check.shown(email, []);
    expect(text('intro')).toContain('Recommended: on-device answers in Italian are experimental');
  });
});

const radio = (value: string): HTMLInputElement =>
  document.getElementById(`level-${value}`) as HTMLInputElement;
const chosen = (): string | undefined =>
  [...document.querySelectorAll<HTMLInputElement>('input[name="deep-check-level"]')].find(
    (input) => input.checked,
  )?.value;
const levelsDisabled = (): boolean => (get('levels') as HTMLFieldSetElement).disabled;

const choose = (value: string): void => {
  radio(value).checked = true;
  radio(value).dispatchEvent(new Event('change', { bubbles: true }));
};

describe('the privacy level', () => {
  it('starts at "standard": no name search, names kept, everything else removed', async () => {
    let modelWaits = 0;
    check = create({
      savedLevel: () => undefined,
      modelReady: async () => {
        modelWaits++;
        return true;
      },
    });
    expect(chosen()).toBe('standard');
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(nameCalls).toHaveLength(0);
    expect(modelWaits).toBe(0);
    const data = text('data');
    expect(data).toContain('Dear Anna Muster');
    expect(data).toContain('"name": "Anna Muster"');
    expect(data).not.toMatch(/CH93|123 45 67|pay\?user|anna\.muster@/i);
    // No "names" item: none were removed at this level.
    expect(get('removed').querySelector('[data-kind="name"]')).toBeNull();
    expect(text('removedHeading')).toBe('Found in this email and removed before sending:');
    click('send');
    expect(runs[0]?.prompt).toContain('Dear Anna Muster');
  });

  it('uses the level chosen last time, and ignores a stored value it does not know', () => {
    expect(create({ savedLevel: () => 'high' }) && chosen()).toBe('high');
    expect(create({ savedLevel: () => 'everything' }) && chosen()).toBe('standard');
  });

  it('remembers a new level and builds the data again at it', async () => {
    const saved: string[] = [];
    check = create({ savedLevel: () => undefined, saveLevel: (value) => saved.push(value) });
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    choose('high');
    expect(saved).toEqual(['high']);
    // The old data is gone at once; nothing can be sent until the new data is there.
    expect(get('preview').hidden).toBe(true);
    click('send');
    expect(runs).toHaveLength(0);
    // Built again, now at "high": Nano looks for names, and the names are gone from the data.
    await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
    nameCalls[0]?.resolve(['Anna Muster']);
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(get('removed').querySelector('[data-kind="name"]')).not.toBeNull();
    expect(text('data')).not.toContain('Anna');
  });

  it('chooses a level by a click anywhere on its card', async () => {
    check = create({ savedLevel: () => 'standard' });
    check.shown(email, []);
    const list = document.getElementById('list-high') as HTMLElement;
    list.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chosen()).toBe('high');
    // Not while the levels are disabled.
    click('start');
    await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
    (document.getElementById('list-standard') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(chosen()).toBe('high');
  });

  it('cannot change while names are searched or the data is on its way', async () => {
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
    expect(levelsDisabled()).toBe(true);
    nameCalls[0]?.resolve(['Anna Muster']);
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(levelsDisabled()).toBe(false);
    click('send');
    expect(levelsDisabled()).toBe(true);
    runs[0]?.resolve(answer('safe'));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    expect(levelsDisabled()).toBe(false);
  });

  it('keeps a result readable after a change, and says which level its data was sent at', async () => {
    check = create({ savedLevel: () => undefined });
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    click('send');
    runs[0]?.resolve(answer('safe'));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    choose('high');
    expect(get('result').hidden).toBe(false);
    expect(text('status')).toBe(
      'The new privacy level applies to the next deep check. The data above was sent at the previous level.',
    );
  });

  it('cannot be chosen when the cloud is not available', () => {
    check = create({ available: false });
    check.shown(email, []);
    expect(levelsDisabled()).toBe(true);
  });
});

describe('removedItems', () => {
  it('names only what was removed, with its count, in a fixed order', () => {
    expect(removedItems({ names: 1, emails: 2, numbers: 0, ibans: 1, links: 0 })).toEqual([
      { kind: 'name', text: '1 name' },
      { kind: 'email', text: '2 email addresses' },
      { kind: 'iban', text: '1 IBAN' },
    ]);
    expect(removedItems({ names: 0, emails: 0, numbers: 2, ibans: 0, links: 3 })).toEqual([
      { kind: 'number', text: '2 numbers' },
      { kind: 'link', text: "3 link paths (the website's name stays)" },
    ]);
    expect(removedItems({ names: 0, emails: 0, numbers: 0, ibans: 0, links: 0 })).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------------
 * The list of what was removed, the marks in the data, and the tooltip, on the real filter's data
 * and its record of the replaced places.
 * --------------------------------------------------------------------------------------------- */

const marks = (): HTMLElement[] => [...get('data').querySelectorAll<HTMLElement>('.redacted')];
const marksOf = (kind: RedactedKind): HTMLElement[] =>
  marks().filter((mark) => mark.dataset.kind === kind);
const items = (): HTMLButtonElement[] => [
  ...get('removed').querySelectorAll<HTMLButtonElement>('.removed__item'),
];
const item = (kind: RedactedKind): HTMLButtonElement =>
  items().find((button) => button.dataset.kind === kind) as HTMLButtonElement;
const tabbable = (): HTMLElement[] => [
  ...get('data').querySelectorAll<HTMLElement>('[tabindex="0"]'),
];
const struck = (): string => get('tip').querySelector('s')?.textContent ?? '';

/** A click with a pointer (`detail` 1); `element.click()` is one without (Enter or Space). */
const mouseClick = (element: HTMLElement): void => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
};
const mouse = (element: EventTarget, type: 'mouseover' | 'mouseout', relatedTarget?: Element) => {
  element.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget }));
};
const key = (element: HTMLElement, name: string): void => {
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  );
};

/**
 * jsdom lays nothing out (every rectangle is 0 by 0): the data box and the marks get rectangles
 * here. The box is 100 px tall at the top of the page; mark `n` is a 10 px line at `n * 60` px,
 * so the first two marks are in view and the later ones below the box.
 */
const BOX = { top: 0, bottom: 100, height: 100 };
const MARK_HEIGHT = 10;
const markTop = (index: number): number => index * 60;
const rect = (top: number, height: number): DOMRect =>
  ({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 300,
    width: 300,
    x: 0,
    y: top,
  }) as DOMRect;
function layOut(): void {
  Object.defineProperty(get('data'), 'getBoundingClientRect', {
    configurable: true,
    value: () => rect(BOX.top, BOX.height),
  });
  marks().forEach((mark, index) => {
    Object.defineProperty(mark, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(markTop(index) - get('data').scrollTop, MARK_HEIGHT),
    });
  });
}
/** Where the data must scroll to centre mark `index` (the view's own formula). */
const centred = (index: number): number => markTop(index) - (BOX.height - MARK_HEIGHT) / 2;

describe('the list of what was removed', () => {
  it('shows one button per kind with its count, under the heading', async () => {
    check.shown(email, []);
    await prepare();
    expect(text('removedHeading')).toBe('Found in this email and removed before sending:');
    expect(get('removed').hidden).toBe(false);
    expect(items().map((button) => [button.dataset.kind, button.textContent])).toEqual([
      ['name', '2 names'],
      ['email', '1 email address'],
      ['number', '1 number'],
      ['iban', '1 IBAN'],
    ]);
    // Real buttons (Enter and Space work), inside list items; no "names kept" anywhere.
    for (const button of items()) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
      expect(button.parentElement?.tagName).toBe('LI');
    }
    expect(get('consent').textContent).not.toMatch(/kept/i);
  });

  it('says that nothing needed removing, by level, and hides the empty list', async () => {
    // An email with nothing personal in it: no sender address, no numbers, no links.
    const bare: Email = {
      sender: { name: '', address: '' },
      subject: 'Hello',
      bodyText: 'Hello there, see you tomorrow.',
      links: [],
      truncated: false,
    };
    check.shown(bare, []);
    await prepare([]);
    expect((supplied.last as CloudData).spans).toEqual([]);
    expect(text('removedHeading')).toBe(
      'Nothing found to remove: no names, email addresses, numbers, IBANs or link paths.',
    );
    expect(get('removed').hidden).toBe(true);
    expect(items()).toEqual([]);
    expect(marks()).toEqual([]);

    check = create({ savedLevel: () => 'standard' });
    check.shown(bare, []);
    click('start');
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(text('removedHeading')).toBe(
      'Nothing found to remove: no email addresses, numbers, IBANs or link paths.',
    );
    expect(get('removed').hidden).toBe(true);
  });
});

describe('the marks in the data', () => {
  it('wraps exactly the recorded places, and the text stays the data', async () => {
    check.shown(email, []);
    await prepare();
    const data = supplied.last as CloudData;
    // The filter's record: the sender's name and address, then the name, IBAN and phone number
    // in the text.
    expect(data.spans.map((span) => [span.kind, span.original])).toEqual([
      ['name', ORIGINALS.name],
      ['email', ORIGINALS.address],
      ['name', ORIGINALS.name],
      ['iban', ORIGINALS.iban],
      ['number', ORIGINALS.phone],
    ]);
    expect(text('data')).toBe(data.json);
    expect(marks().map((mark) => mark.textContent)).toEqual([
      '[name]',
      '[email]@mail.example',
      '[name]',
      '[iban]',
      '[number]',
    ]);
    expect(marks().map((mark) => mark.dataset.kind)).toEqual(data.spans.map((span) => span.kind));
    // Marks only in the data, none in the list; the originals stay on the device: neither the
    // data nor the prompt holds them.
    expect(get('removed').querySelector('.redacted')).toBeNull();
    click('send');
    expect(runs[0]?.prompt).toContain(data.json);
    for (const original of Object.values(ORIGINALS)) {
      expect(text('data')).not.toContain(original);
      expect(runs[0]?.prompt).not.toContain(original);
    }
  });

  it('keeps the originals out of the data and the prompt even when the filter kept them', async () => {
    // The filter removes the originals from the JSON anyway; this proves the view adds nothing:
    // a made-up record whose originals are a sentinel shows it only in the tooltip.
    const sentinel = 'ORIGINAL-SENTINEL';
    supplied.alter = (data) => ({
      ...data,
      spans: data.spans.map((span) => ({ ...span, original: sentinel })),
    });
    check.shown(email, []);
    await prepare();
    click('show');
    const [mark] = marks() as [HTMLElement];
    mark.focus();
    expect(struck()).toBe(sentinel);
    // Not in the data's text, and not in any attribute of its markup either.
    expect(text('data')).not.toContain(sentinel);
    expect(get('data').outerHTML).not.toContain(sentinel);
    click('send');
    expect(runs[0]?.prompt).not.toContain(sentinel);
  });

  it("marks nothing an attacker wrote to look like a placeholder: only the filter's record counts", async () => {
    const literal = 'Hi [name] and [email]@x.example, see [link: a.example]';
    check.shown({ ...email, bodyText: literal }, []);
    await prepare();
    // The filter replaced the sender's name and address, nothing in the text: two marks, and the
    // text's own "[name]" stays plain text.
    expect(marks().map((mark) => mark.textContent)).toEqual(['[name]', '[email]@mail.example']);
    expect(text('data')).toContain(literal);
    const plain = [...get('data').childNodes].filter(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes(literal),
    );
    expect(plain).toHaveLength(1);
    // And with no record at all, no mark at all, whatever the text says.
    supplied.alter = (data) => ({ ...data, spans: [] });
    check.shown(other, []);
    nameCalls = [];
    await prepare();
    expect(text('data')).toContain('[name]');
    expect(marks()).toEqual([]);
    expect(tabbable()).toEqual([]);
  });

  it('keeps one mark reachable by Tab and moves between marks with the arrow keys', async () => {
    check.shown(email, []);
    await prepare();
    const all = marks();
    expect(all.length).toBeGreaterThan(2);
    expect(tabbable()).toEqual([all[0]]);
    (all[0] as HTMLElement).focus();
    key(all[0] as HTMLElement, 'ArrowRight');
    expect(document.activeElement).toBe(all[1]);
    expect(tabbable()).toEqual([all[1]]);
    key(all[1] as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(all[2]);
    key(all[2] as HTMLElement, 'ArrowLeft');
    expect(document.activeElement).toBe(all[1]);
    key(all[1] as HTMLElement, 'End');
    expect(document.activeElement).toBe(all.at(-1));
    // At the ends the focus stays.
    key(all.at(-1) as HTMLElement, 'ArrowRight');
    expect(document.activeElement).toBe(all.at(-1));
    key(all.at(-1) as HTMLElement, 'Home');
    expect(document.activeElement).toBe(all[0]);
    key(all[0] as HTMLElement, 'ArrowUp');
    expect(document.activeElement).toBe(all[0]);
    expect(tabbable()).toHaveLength(1);
    // Arrow keys on the data itself (no mark focused) are left to its scrolling.
    get('data').focus();
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    get('data').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(get('data'));
  });

  it('highlights a kind on a click on its item, opens the data and scrolls to its marks in turn', async () => {
    check.shown(email, []);
    await prepare();
    expect(get('dataPanel').hidden).toBe(true);
    layOut();
    const data = get('data');
    // Marks 0 and 2 are the names (the sender's, then the one in the text), mark 1 the address.
    const names = marksOf('name');
    expect(names).toEqual([marks()[0], marks()[2]]);

    mouseClick(item('name'));
    expect(get('dataPanel').hidden).toBe(false);
    expect(get('show').getAttribute('aria-expanded')).toBe('true');
    expect(data.dataset.selectedKind).toBe('name');
    expect(item('name').getAttribute('aria-current')).toBe('true');
    expect(item('email').hasAttribute('aria-current')).toBe(false);
    // The first name is in view already: no scrolling.
    expect(data.scrollTop).toBe(0);
    // The Tab stop follows the current mark; a mouse click leaves the focus where it is.
    expect(tabbable()).toEqual([names[0]]);
    expect(document.activeElement).not.toBe(names[0]);

    // Again: the next mark of that kind, below the box, so the data (and only the data) scrolls
    // to centre it; then round to the first, back at the top.
    mouseClick(item('name'));
    expect(data.scrollTop).toBe(centred(2));
    expect(tabbable()).toEqual([names[1]]);
    mouseClick(item('name'));
    expect(data.scrollTop).toBe(0);
    expect(tabbable()).toEqual([names[0]]);

    // Another kind: its first mark; the item marks move with it. The address (mark 1) is in
    // view at the top: no scrolling.
    mouseClick(item('email'));
    expect(data.dataset.selectedKind).toBe('email');
    expect(item('email').getAttribute('aria-current')).toBe('true');
    expect(item('name').hasAttribute('aria-current')).toBe(false);
    expect(data.scrollTop).toBe(0);
    expect(tabbable()).toEqual([marks()[1]]);
    // The phone number (mark 4) is far below: centred too.
    mouseClick(item('number'));
    expect(data.scrollTop).toBe(centred(4));
    // The CSS colours the marks by the two attributes; nothing else changes on them.
    expect(marks().every((mark) => mark.classList.contains('redacted'))).toBe(true);
  });

  it('moves the focus to the mark when the item is activated by keyboard', async () => {
    check.shown(email, []);
    await prepare();
    item('iban').focus();
    // Enter or Space on a button: a click without a pointer.
    item('iban').click();
    const [iban] = marksOf('iban');
    expect(document.activeElement).toBe(iban);
    expect(tabbable()).toEqual([iban]);
    // The focused mark shows its tooltip at once: the IBAN as it stood in the email.
    expect(get('tip').hidden).toBe(false);
    expect(struck()).toBe(ORIGINALS.iban);
  });

  it('closes the data without losing the focus or the tooltip state', async () => {
    check.shown(email, []);
    await prepare();
    item('number').click();
    expect(get('dataPanel').hidden).toBe(false);
    expect(get('tip').hidden).toBe(false);
    click('show');
    expect(get('dataPanel').hidden).toBe(true);
    expect(get('tip').hidden).toBe(true);
    // A new preview starts over: no selection, no marks of the old data.
    choose('standard');
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(get('data').dataset.selectedKind).toBeUndefined();
    expect(items().every((button) => !button.hasAttribute('aria-current'))).toBe(true);
    expect(tabbable()).toHaveLength(1);
  });

  it('moves a focus from a removed mark to the start when the email is left', async () => {
    check.shown(email, []);
    await prepare();
    item('name').click();
    expect(get('data').contains(document.activeElement)).toBe(true);
    check.shown(other, []);
    expect(get('preview').hidden).toBe(true);
    expect(document.activeElement).toBe(get('start'));
    expect(get('tip').hidden).toBe(true);
  });
});

describe('the tooltip', () => {
  it('shows the original text, struck through, for a focused mark, and goes on blur or Escape', async () => {
    check.shown(email, []);
    await prepare();
    click('show');
    const [mark] = marksOf('email');
    expect(get('tip').hidden).toBe(true);
    (mark as HTMLElement).focus();
    expect(get('tip').hidden).toBe(false);
    expect(struck()).toBe(ORIGINALS.address);
    expect(mark?.getAttribute('aria-describedby')).toBe('tip');
    // Only the original, struck through: no label around it.
    expect(text('tip')).toBe(ORIGINALS.address);
    // The original is shown on the device and nowhere else.
    expect(text('data')).not.toContain(ORIGINALS.address);
    key(mark as HTMLElement, 'Escape');
    expect(get('tip').hidden).toBe(true);
    expect(mark?.hasAttribute('aria-describedby')).toBe(false);
    // Escape holds: the pointer passing over another mark and leaving again does not bring the
    // focused mark's tooltip back (review round 2), not even after a second Escape on the
    // hovered mark's tooltip (review round 3).
    const [passing] = marksOf('name') as [HTMLElement];
    mouse(passing, 'mouseover');
    await vi.advanceTimersByTimeAsync(TIP_DELAY_MS);
    expect(struck()).toBe(ORIGINALS.name);
    key(mark as HTMLElement, 'Escape');
    expect(get('tip').hidden).toBe(true);
    mouse(passing, 'mouseover');
    await vi.advanceTimersByTimeAsync(TIP_DELAY_MS);
    mouse(passing, 'mouseout');
    await vi.advanceTimersByTimeAsync(TIP_HIDE_MS);
    expect(get('tip').hidden).toBe(true);
    (mark as HTMLElement).blur();
    (mark as HTMLElement).focus();
    expect(get('tip').hidden).toBe(false);
    get('data').focus();
    expect(get('tip').hidden).toBe(true);
  });

  it('waits before the first tooltip, is quick while warm, and waits again after a pause', async () => {
    check.shown(email, []);
    await prepare();
    click('show');
    const [first, second] = marks() as [HTMLElement, HTMLElement];
    mouse(first, 'mouseover');
    await vi.advanceTimersByTimeAsync(TIP_DELAY_MS - 1);
    expect(get('tip').hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(get('tip').hidden).toBe(false);
    expect(first.getAttribute('aria-describedby')).toBe('tip');
    // On to the next mark: a moment after leaving the first, the tooltip goes; the next one comes
    // almost at once.
    mouse(first, 'mouseout');
    mouse(second, 'mouseover');
    await vi.advanceTimersByTimeAsync(TIP_QUICK_MS);
    expect(get('tip').hidden).toBe(false);
    expect(second.getAttribute('aria-describedby')).toBe('tip');
    expect(first.hasAttribute('aria-describedby')).toBe(false);
    mouse(second, 'mouseout');
    await vi.advanceTimersByTimeAsync(TIP_HIDE_MS);
    expect(get('tip').hidden).toBe(true);
    // Still warm: the next one is quick.
    mouse(first, 'mouseover');
    await vi.advanceTimersByTimeAsync(TIP_QUICK_MS);
    expect(get('tip').hidden).toBe(false);
    mouse(first, 'mouseout');
    await vi.advanceTimersByTimeAsync(TIP_HIDE_MS + TIP_WARM_MS);
    expect(get('tip').hidden).toBe(true);
    // Cold again: the full wait.
    mouse(second, 'mouseover');
    await vi.advanceTimersByTimeAsync(TIP_QUICK_MS);
    expect(get('tip').hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(TIP_DELAY_MS - TIP_QUICK_MS);
    expect(get('tip').hidden).toBe(false);
  });

  it('stays while the pointer is on it, and caps a long original', async () => {
    // A made-up record: the first place stood for a text longer than the tooltip shows.
    const long = 'x'.repeat(TIP_MAX_CHARS + 50);
    supplied.alter = (data) => ({
      ...data,
      spans: data.spans.map((span, index) => (index === 0 ? { ...span, original: long } : span)),
    });
    check.shown(email, []);
    await prepare();
    click('show');
    const [mark] = marks() as [HTMLElement];
    mouse(mark, 'mouseover');
    await vi.advanceTimersByTimeAsync(TIP_DELAY_MS);
    expect(get('tip').hidden).toBe(false);
    expect(struck()).toBe(`${'x'.repeat(TIP_MAX_CHARS)}…`);
    // Onto the tooltip: it stays as long as the pointer is there.
    mouse(mark, 'mouseout', get('tip'));
    mouse(get('tip'), 'mouseover');
    await vi.advanceTimersByTimeAsync(TIP_HIDE_MS + TIP_WARM_MS);
    expect(get('tip').hidden).toBe(false);
    // And goes a moment after the pointer leaves it.
    mouse(get('tip'), 'mouseout');
    await vi.advanceTimersByTimeAsync(TIP_HIDE_MS);
    expect(get('tip').hidden).toBe(true);
  });

  it('leaves no tooltip and no timer behind when the preview goes', async () => {
    check.shown(email, []);
    await prepare();
    click('show');
    const [mark] = marks() as [HTMLElement];
    mouse(mark, 'mouseover');
    click('cancel');
    await vi.advanceTimersByTimeAsync(TIP_WARM_MS);
    expect(get('tip').hidden).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    // Also with a tooltip on screen, when the email is left.
    nameCalls = [];
    await prepare();
    click('show');
    const [again] = marks() as [HTMLElement];
    again.focus();
    expect(get('tip').hidden).toBe(false);
    check.hidden();
    expect(get('tip').hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(TIP_WARM_MS);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('"Nothing has been sent yet"', () => {
  it('goes with the click on Send, also when the send fails, and is back after Cancel and for the next email', async () => {
    check.shown(email, []);
    await prepare();
    expect(get('nothingYet').hidden).toBe(false);
    click('send');
    expect(get('nothingYet').hidden).toBe(true);
    runs[0]?.resolve({ ok: false, reason: 'failed', detail: 'no' });
    await vi.waitFor(() => expect(text('status')).toContain('did not work'));
    expect(get('nothingYet').hidden).toBe(true);
    click('cancel');
    expect(get('nothingYet').hidden).toBe(false);
    nameCalls = [];
    await prepare();
    click('send');
    runs[1]?.resolve(answer('safe'));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    expect(get('nothingYet').hidden).toBe(true);
    check.shown(other, []);
    expect(get('nothingYet').hidden).toBe(false);
  });
});

/** Renders `json` with `spans` into a fresh <pre>. */
const render = (json: string, spans: RedactedSpan[]) => {
  const pre = document.createElement('pre');
  const result = renderRedacted(pre, json, spans);
  return { pre, result };
};
const span = (start: number, end: number, kind: RedactedKind = 'name'): RedactedSpan => ({
  start,
  end,
  kind,
  original: `${kind}@${start}`,
});

describe('renderRedacted', () => {
  it('wraps each span in a mark and nests a span inside another', () => {
    const json = 'to [email]@[name].example now';
    const outer = span(3, 25, 'email');
    const inner = span(11, 17, 'name');
    const { pre, result } = render(json, [outer, inner]);
    expect(pre.textContent).toBe(json);
    expect(result.map((mark) => mark.element.textContent)).toEqual([
      '[email]@[name].example',
      '[name]',
    ]);
    expect(result[1]?.element.parentElement).toBe(result[0]?.element);
    expect(result.map((mark) => mark.original)).toEqual(['email@3', 'name@11']);
    for (const { element } of result) {
      expect(element.tagName).toBe('MARK');
      expect(element.classList.contains('redacted')).toBe(true);
      expect(element.tabIndex).toBe(-1);
    }
    expect(pre.children).toHaveLength(1);
    // The same with the inner span listed first.
    expect(render(json, [inner, outer]).pre.textContent).toBe(json);
    expect(render(json, [inner, outer]).result.map((mark) => mark.kind)).toEqual(['email', 'name']);
  });

  it('leaves out a span it cannot trust and keeps the text whole', () => {
    const json = '0123456789';
    const { pre, result } = render(json, [
      span(-1, 2),
      span(8, 11),
      span(4, 4),
      span(5, 3),
      span(2, 5, 'number'),
      // Crossing the one before it: not nested.
      span(4, 7),
      { start: 7, end: 9, kind: 'bogus' as RedactedKind, original: '' },
      { start: 1.5, end: 3, kind: 'name', original: '' },
    ]);
    expect(pre.textContent).toBe(json);
    expect(result.map((mark) => [mark.element.textContent, mark.kind])).toEqual([
      ['234', 'number'],
    ]);
    // No spans: text only, no mark.
    expect(render(json, []).pre.childNodes).toHaveLength(1);
    expect(render('', [span(0, 1)]).pre.textContent).toBe('');
  });

  it('renders text and never markup', () => {
    const json = '<img src=x onerror=alert(1)> [name]';
    const at = json.indexOf('[name]');
    const { pre } = render(json, [span(at, at + 6)]);
    expect(pre.textContent).toBe(json);
    expect(pre.querySelector('img')).toBeNull();
    expect(pre.querySelectorAll('mark')).toHaveLength(1);
  });
});
