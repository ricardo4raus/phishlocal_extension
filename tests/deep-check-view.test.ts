// @vitest-environment jsdom
// The cloud deep check in the side panel, with the model, Nano's name finder and the cloud
// replaced by fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCheckResult } from '../src/ai';
import type { Email } from '../src/email';
import type { Finding } from '../src/rules';
import { HEADERS_WAIT_MS, STOP_GRACE_MS } from '../src/sidepanel/ai-view';
import {
  CLOUD_LIMIT_EXTRA_MS,
  createDeepCheck,
  type DeepCheck,
  type DeepCheckDeps,
  removedSummary,
} from '../src/sidepanel/deep-check-view';
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

const BUTTONS = ['start', 'stop', 'send', 'cancel'] as const;
const IDS = [
  'section',
  'intro',
  ...BUTTONS,
  'level',
  'preview',
  'removed',
  'data',
  'status',
  'result',
  'overall',
  'note',
  'reasons',
  'advice',
] as const;
type Id = (typeof IDS)[number];

const get = (id: Id) => document.getElementById(id) as HTMLElement;
const text = (id: Id): string => get(id).textContent ?? '';
const click = (id: (typeof BUTTONS)[number]): void => get(id).click();

let nameCalls: { text: string; signal: AbortSignal; resolve: (names?: string[]) => void }[];
let runs: { prompt: string; signal: AbortSignal; resolve: (result: AiCheckResult) => void }[];
let check: DeepCheck;

/** A fresh panel (new elements, so no listeners of an earlier instance) and a deep check on it. */
function create(deps: Partial<DeepCheckDeps> = {}): DeepCheck {
  const elements = IDS.map((id) => {
    const tag = (BUTTONS as readonly string[]).includes(id)
      ? 'button'
      : id === 'reasons'
        ? 'ul'
        : id === 'level'
          ? 'select'
          : 'div';
    const element = document.createElement(tag);
    element.id = id;
    // As in index.html: the levels are the select's options.
    if (element instanceof HTMLSelectElement) {
      for (const value of ['standard', 'high']) element.append(new Option(value, value));
    }
    // As in index.html: the data and the result can take the focus.
    if (id === 'data') element.tabIndex = 0;
    if (id === 'result') element.tabIndex = -1;
    return element;
  });
  // As in index.html, the section holds everything else.
  const [section, ...inside] = elements;
  section?.append(...inside);
  document.body.replaceChildren(...(section ? [section] : []));
  return createDeepCheck(
    {
      section: get('section'),
      intro: get('intro'),
      start: get('start') as HTMLButtonElement,
      level: get('level') as HTMLSelectElement,
      stop: get('stop') as HTMLButtonElement,
      preview: get('preview'),
      removed: get('removed'),
      data: get('data'),
      send: get('send') as HTMLButtonElement,
      cancel: get('cancel') as HTMLButtonElement,
      status: get('status'),
      result: get('result'),
      overall: get('overall'),
      note: get('note'),
      reasons: get('reasons') as HTMLUListElement,
      advice: get('advice'),
    },
    {
      available: true,
      uiLanguage: () => 'en-GB',
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
    expect(document.activeElement).toBe(get('data'));
    expect(runs).toHaveLength(0);

    click('send');
    click('send');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.prompt).toContain(shownData);
    runs[0]?.resolve(answer('dangerous'));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    expect(text('overall')).toBe('Deep check: Dangerous');
    expect(get('result').dataset.risk).toBe('dangerous');
    expect(text('advice')).toBe('Cloud advice.');
    expect(get('send').hidden).toBe(true);
    expect(document.activeElement).toBe(get('result'));
    // The data stays as the record of what was sent.
    expect(text('data')).toBe(shownData);
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
    expect(text('status')).toBe('Waiting for the on-device model…');
    await vi.advanceTimersByTimeAsync(NAMES_TIMEOUT_MS * 10);
    loaded?.(true);
    await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
    expect(nameCalls[0]?.signal.aborted).toBe(false);
    nameCalls[0]?.resolve([]);
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(text('status')).not.toContain('names may remain');
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
    expect(text('status')).toContain('names may remain');
    expect(JSON.parse(text('data'))).toMatchObject({ email: { from: { name: '[name]' } } });
  });

  it('warns when the model is not ready, without asking it', async () => {
    check = create({ modelReady: async () => false });
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(nameCalls).toHaveLength(0);
    expect(text('status')).toContain('names may remain');
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
    expect(text('status')).toContain('names may remain');
    click('send');
    await vi.advanceTimersByTimeAsync(CLOUD_LIMIT_MS);
    expect(runs[0]?.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS);
    expect(text('status')).toBe(
      `The deep check failed (no answer within ${CLOUD_LIMIT_MS / 1000} s). The on-device and rule checks still apply.`,
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
    expect(text('status')).toBe(
      'The deep check failed (no answer within 20 s). The on-device and rule checks still apply.',
    );
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
    expect(text('status')).toContain('names may remain');
  });

  it('keeps the rules as the lower limit', async () => {
    check.shown(email, [danger]);
    await prepare();
    click('send');
    runs[0]?.resolve(answer('safe'));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    expect(text('overall')).toBe(
      'Deep check: Dangerous (basic checks; the cloud AI said: no signs of phishing)',
    );
    expect(text('advice')).not.toBe('Cloud advice.');
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
    await vi.waitFor(() => expect(text('status')).toContain('the cloud refused the request'));
    expect(get('result').hidden).toBe(true);
    expect(get('start').hidden).toBe(false);
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
    check = create({ uiLanguage: () => 'it-IT' });
    check.shown(email, []);
    expect(text('intro')).toContain('Recommended: on-device answers in Italian are experimental');
  });
});

const level = (): HTMLSelectElement => get('level') as HTMLSelectElement;

const choose = (value: string): void => {
  level().value = value;
  level().dispatchEvent(new Event('change'));
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
    expect(level().value).toBe('standard');
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(nameCalls).toHaveLength(0);
    expect(modelWaits).toBe(0);
    const data = text('data');
    expect(data).toContain('Dear Anna Muster');
    expect(data).toContain('"name": "Anna Muster"');
    expect(data).not.toMatch(/CH93|123 45 67|pay\?user|anna\.muster@/i);
    expect(text('status')).toContain('Names are kept (privacy level Standard)');
    click('send');
    expect(runs[0]?.prompt).toContain('Dear Anna Muster');
  });

  it('uses the level chosen last time, and ignores a stored value it does not know', () => {
    expect(create({ savedLevel: () => 'high' }) && level().value).toBe('high');
    expect(create({ savedLevel: () => 'everything' }) && level().value).toBe('standard');
  });

  it('remembers a new level and discards a preview prepared at the old one', async () => {
    const saved: string[] = [];
    check = create({ savedLevel: () => undefined, saveLevel: (value) => saved.push(value) });
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    choose('high');
    expect(saved).toEqual(['high']);
    expect(get('preview').hidden).toBe(true);
    expect(text('status')).toBe(
      'The privacy level changed, so the prepared data was discarded. Nothing was sent.',
    );
    click('send');
    expect(runs).toHaveLength(0);
    // Prepared again, now at "high": Nano looks for names.
    click('start');
    await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
  });

  it('cannot change while names are searched or the data is on its way', async () => {
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
    expect(level().disabled).toBe(true);
    nameCalls[0]?.resolve(['Anna Muster']);
    await vi.waitFor(() => expect(get('preview').hidden).toBe(false));
    expect(level().disabled).toBe(false);
    click('send');
    expect(level().disabled).toBe(true);
    runs[0]?.resolve(answer('safe'));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    expect(level().disabled).toBe(false);
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
    expect(level().disabled).toBe(true);
  });
});

describe('removedSummary', () => {
  it('names only what was removed', () => {
    expect(removedSummary({ names: 1, emails: 2, numbers: 0, ibans: 1, links: 0 })).toBe(
      'Removed on this device: 1 name, 2 email addresses (domain kept), 1 IBAN. Links are sent as their domain only.',
    );
    expect(removedSummary({ names: 0, emails: 0, numbers: 0, ibans: 0, links: 0 })).toBe(
      'No personal data found to remove. Links are sent as their domain only.',
    );
  });
});
