// @vitest-environment jsdom
// The cloud deep check in the side panel, with Nano's name finder and the cloud replaced by fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCheckResult } from '../src/ai';
import type { Email } from '../src/email';
import type { Finding } from '../src/rules';
import { STOP_GRACE_MS } from '../src/sidepanel/ai-view';
import {
  CLOUD_LIMIT_MS,
  createDeepCheck,
  type DeepCheck,
  type DeepCheckDeps,
  NAMES_TIMEOUT_MS,
  removedSummary,
} from '../src/sidepanel/deep-check-view';

const email: Email = {
  sender: { name: 'Anna Muster', address: 'anna.muster@mail.example' },
  subject: 'Invoice',
  bodyText: 'Dear Anna Muster, pay to CH93 0076 2011 6238 5295 7 or call +41 79 123 45 67.',
  links: [{ text: 'Pay now', href: 'https://evil.example/pay?user=anna' }],
  truncated: false,
};

const other: Email = { ...email, subject: 'Another one' };

const danger: Finding = { rule: 'dangerous-link', severity: 'danger', message: 'x', evidence: [] };

const IDS = [
  'section',
  'intro',
  'start',
  'preview',
  'removed',
  'data',
  'send',
  'cancel',
  'status',
  'result',
  'overall',
  'note',
  'reasons',
  'advice',
] as const;

const get = (id: (typeof IDS)[number]) => document.getElementById(id) as HTMLElement;
const text = (id: (typeof IDS)[number]): string => get(id).textContent ?? '';
const click = (id: 'start' | 'send' | 'cancel'): void => get(id).click();

let nameCalls: { text: string; signal: AbortSignal; resolve: (names?: string[]) => void }[];
let runs: { prompt: string; signal: AbortSignal; resolve: (result: AiCheckResult) => void }[];
let check: DeepCheck;

function create(deps: Partial<DeepCheckDeps> = {}): DeepCheck {
  return createDeepCheck(
    {
      section: get('section'),
      intro: get('intro'),
      start: get('start') as HTMLButtonElement,
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
      findNames: (searched, _language, signal) =>
        new Promise((resolve) => nameCalls.push({ text: searched, signal, resolve })),
      run: (prompt, signal) =>
        new Promise((resolve) => {
          runs.push({ prompt, signal, resolve });
          signal.addEventListener('abort', () => resolve({ ok: false, reason: 'stopped' }));
        }),
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
  document.body.innerHTML = '';
  for (const id of IDS) {
    const element = document.createElement(
      id === 'start' || id === 'send' || id === 'cancel'
        ? 'button'
        : id === 'reasons'
          ? 'ul'
          : 'div',
    );
    element.id = id;
    document.body.append(element);
  }
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

  it('stops the name search and the request when the email is left, and drops late answers', async () => {
    check.shown(email, []);
    click('start');
    await vi.waitFor(() => expect(nameCalls).toHaveLength(1));
    check.shown(other, []);
    expect(nameCalls[0]?.signal.aborted).toBe(true);
    nameCalls[0]?.resolve(['Anna Muster']);
    await vi.advanceTimersByTimeAsync(0);
    expect(get('preview').hidden).toBe(true);

    nameCalls = [];
    await prepare();
    click('send');
    check.hidden();
    expect(runs[0]?.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(get('section').hidden).toBe(true);
    expect(get('result').hidden).toBe(true);
  });

  it('keeps the preview when Gmail shows the same email again', async () => {
    check.shown(email, []);
    await prepare();
    check.shown({ ...email }, []);
    expect(get('preview').hidden).toBe(false);
    click('send');
    expect(runs).toHaveLength(1);
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
    expect(text('removed')).toContain('names may remain');
    expect(JSON.parse(text('data'))).toMatchObject({ email: { from: { name: '[name]' } } });
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
    expect(text('removed')).toContain('names may remain');
    click('send');
    await vi.advanceTimersByTimeAsync(CLOUD_LIMIT_MS);
    expect(runs[0]?.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS);
    expect(text('status')).toBe(
      `The deep check failed (no answer within ${CLOUD_LIMIT_MS / 1000} s). The checks above still apply.`,
    );
    expect(vi.getTimerCount()).toBe(0);
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
    expect(text('removed')).toContain('names may remain');
  });

  it('keeps the rules as the lower limit', async () => {
    check.shown(email, [danger]);
    await prepare();
    click('send');
    runs[0]?.resolve(answer('safe'));
    await vi.waitFor(() => expect(get('result').hidden).toBe(false));
    expect(text('overall')).toBe(
      'Deep check: Dangerous (rule checks; the cloud AI said: no signs of phishing)',
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
    runs[0]?.resolve({ ok: false, reason: 'failed', detail: 'App Check token invalid' });
    await vi.waitFor(() => expect(text('status')).toContain('App Check token invalid'));
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
