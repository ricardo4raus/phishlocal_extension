// @vitest-environment jsdom
/*
 * The Gmail watcher on a made-up Gmail page (structure as measured on 15 and 16 Nov 2026), with
 * a fake port. Loading "Show original" is replaced, so there is no network.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GmailMessage } from '../src/messages';

const loadOriginal = vi.hoisted(() =>
  vi.fn<(url: URL, options?: { signal?: AbortSignal }) => Promise<string>>(),
);
const readAccountKey = vi.hoisted(() => vi.fn<() => string | undefined>());
vi.mock('../src/content/gmail-original', async (original) => ({
  ...(await original<typeof import('../src/content/gmail-original')>()),
  loadOriginal,
  readAccountKey,
}));

const { OriginalError } = await import('../src/content/gmail-original');
const { SCAN_DELAY_MS, watchGmail } = await import('../src/content/gmail-watch');

beforeAll(() => {
  // jsdom has no layout, so innerText is undefined there; textContent is close enough here.
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? '';
    },
  });
});

/** Shows one open email (or the inbox with `id` undefined). */
function openEmail(id?: string, subject = 'Statement'): void {
  document.body.innerHTML = id
    ? `<h2 class="hP">${subject}</h2>
       <div class="adn" data-message-id="#${id}">
         <span class="gD" email="news@lumorabank.example" name="Lumora Bank">Lumora Bank</span>
         <div class="a3s">Hello</div>
       </div>`
    : '<div class="inbox">Inbox</div>';
}

let posted: GmailMessage[];
let onMessage: ((message: unknown) => void) | undefined;
let onDisconnect: (() => void) | undefined;

function connect(): void {
  watchGmail(
    {
      postMessage: (message) => posted.push(message),
      onMessage: { addListener: (listener) => (onMessage = listener) },
      onDisconnect: { addListener: (listener) => (onDisconnect = listener) },
    },
    {
      document,
      location: { origin: 'https://mail.google.com', pathname: '/mail/u/0/' } as Location,
    },
  );
}

/** Lets the watcher see DOM changes and finish loading. */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(SCAN_DELAY_MS + 10);
};

const types = (): string[] =>
  posted.map((message) => ('key' in message ? `${message.type}:${message.key}` : message.type));

beforeEach(() => {
  vi.useFakeTimers();
  posted = [];
  loadOriginal.mockReset();
  loadOriginal.mockResolvedValue('<pre>raw</pre>');
  readAccountKey.mockReset();
  readAccountKey.mockReturnValue('a1b2c3d4e5');
});

afterEach(() => {
  onDisconnect?.();
  vi.useRealTimers();
});

describe('watchGmail', () => {
  it('reports the open email and then its Show original page', async () => {
    openEmail('msg-f:1');
    connect();
    await settle();
    expect(types()).toEqual(['email:msg-f:1', 'original:msg-f:1']);
    expect(posted[0]).toMatchObject({
      email: { sender: { address: 'news@lumorabank.example' }, subject: 'Statement' },
    });
    expect(loadOriginal.mock.calls[0]?.[0].href).toBe(
      'https://mail.google.com/mail/u/0/?ik=a1b2c3d4e5&view=om&permmsgid=msg-f%3A1',
    );
  });

  it('reports a newly opened email, but not the same one again', async () => {
    openEmail('msg-f:1');
    connect();
    await settle();
    document.body.append(document.createElement('span'));
    await settle();
    openEmail('msg-f:2', 'Other');
    await settle();
    expect(types()).toEqual([
      'email:msg-f:1',
      'original:msg-f:1',
      'email:msg-f:2',
      'original:msg-f:2',
    ]);
  });

  it('says once when no email is open', async () => {
    openEmail();
    connect();
    await settle();
    document.body.append(document.createElement('span'));
    await settle();
    expect(types()).toEqual(['no-email']);
  });

  it('reads the open email again on request', async () => {
    openEmail('msg-f:1');
    connect();
    await settle();
    onMessage?.({ type: 'scan' });
    onMessage?.({ type: 'other' });
    await settle();
    expect(types()).toEqual([
      'email:msg-f:1',
      'original:msg-f:1',
      'email:msg-f:1',
      'original:msg-f:1',
    ]);
    // The second time the page comes from the cache.
    expect(loadOriginal).toHaveBeenCalledTimes(1);
  });

  it('reports why the headers could not be loaded', async () => {
    loadOriginal.mockRejectedValue(new OriginalError('timeout'));
    openEmail('msg-f:1');
    connect();
    await settle();
    expect(posted.at(-1)).toEqual({ type: 'original-failed', key: 'msg-f:1', reason: 'timeout' });
  });

  it('reports a missing account key and keeps looking for it', async () => {
    readAccountKey.mockReturnValue(undefined);
    openEmail('msg-f:1');
    connect();
    await settle();
    expect(posted.at(-1)).toEqual({
      type: 'original-failed',
      key: 'msg-f:1',
      reason: 'no-account-key',
    });
    readAccountKey.mockReturnValue('a1b2c3d4e5');
    openEmail('msg-f:2');
    await settle();
    expect(posted.at(-1)).toMatchObject({ type: 'original', key: 'msg-f:2' });
  });

  it('drops the page of an email that is no longer open', async () => {
    let finish: ((html: string) => void) | undefined;
    loadOriginal.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    openEmail('msg-f:1');
    connect();
    await settle();
    openEmail('msg-f:2');
    await settle();
    finish?.('<pre>old</pre>');
    await settle();
    expect(types()).toEqual(['email:msg-f:1', 'email:msg-f:2', 'original:msg-f:2']);
    expect(loadOriginal.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('stops reading when the panel disconnects', async () => {
    openEmail('msg-f:1');
    connect();
    await settle();
    onDisconnect?.();
    openEmail('msg-f:2');
    await settle();
    expect(types()).toEqual(['email:msg-f:1', 'original:msg-f:1']);
  });
});
