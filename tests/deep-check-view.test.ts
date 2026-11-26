// @vitest-environment jsdom
// The cloud deep check in the side panel, with the model, Nano's name finder and the cloud
// replaced by fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudCheckResult } from '../src/ai';
import type { Email } from '../src/email';
import type { Finding } from '../src/rules';
import { HEADERS_WAIT_MS, STOP_GRACE_MS } from '../src/sidepanel/ai-view';
import {
  CLOUD_LIMIT_EXTRA_MS,
  createDeepCheck,
  type DeepCheck,
  type DeepCheckDeps,
  removedChips,
} from '../src/sidepanel/deep-check-view';
import { SENT_TO_SELF_NOTE } from '../src/ai/prompt';
import { DEFAULT_SETTINGS } from '../src/settings';

const NAMES_TIMEOUT_MS = DEFAULT_SETTINGS.namesTimeoutMs;
const CLOUD_LIMIT_MS = DEFAULT_SETTINGS.cloudTimeoutMs + CLOUD_LIMIT_EXTRA_MS;

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
  'removed',
  'warning',
  'dataPanel',
  'data',
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
      : id === 'reasons'
        ? 'ul'
        : id === 'levels'
          ? 'fieldset'
          : 'div';
    const element = document.createElement(tag);
    element.id = id;
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
      removed: get('removed'),
      warning: get('warning'),
      show: get('show') as HTMLButtonElement,
      dataPanel: get('dataPanel'),
      data: get('data'),
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
    // The consent card already says "Sent once": no second line (fresh-Chrome test).
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
    expect(text('removed')).toContain('Names kept');
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
    expect(text('removed')).not.toContain('Names kept');
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

describe('removedChips', () => {
  it('names only what was removed, and what was kept on purpose', () => {
    expect(removedChips({ names: 1, emails: 2, numbers: 0, ibans: 1, links: 0 }, 'high')).toEqual([
      '1 name',
      '2 email addresses',
      '1 IBAN',
    ]);
    expect(
      removedChips({ names: 0, emails: 0, numbers: 0, ibans: 0, links: 3 }, 'standard'),
    ).toEqual(['3 link paths', 'Names kept']);
    expect(removedChips({ names: 0, emails: 0, numbers: 0, ibans: 0, links: 0 }, 'high')).toEqual([
      'No personal data found',
    ]);
  });
});
