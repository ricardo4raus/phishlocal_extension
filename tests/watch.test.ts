// The side panel's connection to the active tab, with a fake chrome.tabs API.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GmailMessage } from '../src/messages';
import { watchActiveTab } from '../src/sidepanel/watch';

interface FakePort {
  name: string;
  tabId: number;
  sent: unknown[];
  disconnected: boolean;
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
  /** Test helpers: what the content script side does. */
  receive(message: unknown): void;
  close(): void;
}

let ports: FakePort[];
let activeTab: { id?: number; windowId: number } | undefined;
let onActivated: (info: { tabId: number; windowId: number }) => void;
let onUpdated: (tabId: number, change: { status?: string }) => void;

function fakePort(tabId: number, name: string): FakePort {
  let onMessage: ((message: unknown) => void) | undefined;
  let onDisconnect: (() => void) | undefined;
  const port: FakePort = {
    name,
    tabId,
    sent: [],
    disconnected: false,
    postMessage: (message) => port.sent.push(message),
    disconnect: () => {
      port.disconnected = true;
    },
    onMessage: { addListener: (listener) => (onMessage = listener) },
    onDisconnect: { addListener: (listener) => (onDisconnect = listener) },
    receive: (message) => onMessage?.(message),
    close: () => onDisconnect?.(),
  };
  return port;
}

const received: GmailMessage[] = [];
let disconnects = 0;

/** Lets the async connect finish. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const start = async () => {
  const watch = watchActiveTab({
    onMessage: (message) => received.push(message),
    onDisconnected: () => {
      disconnects++;
    },
  });
  await settle();
  return watch;
};

beforeEach(() => {
  ports = [];
  received.length = 0;
  disconnects = 0;
  activeTab = { id: 7, windowId: 1 };
  vi.stubGlobal('chrome', {
    runtime: { lastError: undefined },
    tabs: {
      query: async () => (activeTab ? [activeTab] : []),
      connect: (tabId: number, { name }: { name: string }) => {
        const port = fakePort(tabId, name);
        ports.push(port);
        return port;
      },
      onActivated: { addListener: (listener: typeof onActivated) => (onActivated = listener) },
      onUpdated: { addListener: (listener: typeof onUpdated) => (onUpdated = listener) },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('watchActiveTab', () => {
  it('connects to the active tab and passes on only valid messages', async () => {
    await start();
    expect(ports.map((port) => [port.tabId, port.name])).toEqual([[7, 'phishlocal/watch']]);
    ports[0]?.receive({ type: 'no-email' });
    ports[0]?.receive({ type: 'email', key: 'k' });
    ports[0]?.receive('<script>');
    expect(received).toEqual([{ type: 'no-email' }]);
  });

  it('says when the tab has no Gmail content script, and reconnects after a reload', async () => {
    await start();
    ports[0]?.close();
    expect(disconnects).toBe(1);
    onUpdated(7, { status: 'loading' });
    onUpdated(8, { status: 'complete' });
    await settle();
    expect(ports).toHaveLength(1);
    onUpdated(7, { status: 'complete' });
    await settle();
    expect(ports).toHaveLength(2);
  });

  it('follows tab switches in its own window only', async () => {
    await start();
    activeTab = { id: 9, windowId: 1 };
    onActivated({ tabId: 9, windowId: 1 });
    await settle();
    expect(ports.map((port) => port.tabId)).toEqual([7, 9]);
    expect(ports[0]?.disconnected).toBe(true);
    // Messages from the old port are ignored.
    ports[0]?.receive({ type: 'no-email' });
    expect(received).toEqual([]);

    onActivated({ tabId: 3, windowId: 2 });
    await settle();
    expect(ports).toHaveLength(2);
  });

  it('asks for a new scan, or connects first', async () => {
    const watch = await start();
    watch.scan();
    expect(ports[0]?.sent).toEqual([{ type: 'scan' }]);
    ports[0]?.close();
    watch.scan();
    await settle();
    expect(ports).toHaveLength(2);
  });

  it('treats a tab that refuses the connection like a non-Gmail tab', async () => {
    vi.stubGlobal('chrome', {
      ...chrome,
      tabs: {
        ...chrome.tabs,
        connect: () => {
          throw new Error('Cannot access a chrome:// URL');
        },
      },
    });
    await start();
    expect(disconnects).toBe(1);
  });

  it('says so when there is no active tab', async () => {
    activeTab = undefined;
    await start();
    expect(ports).toEqual([]);
    expect(disconnects).toBe(1);
  });

  it('opens only one port when connects overlap', async () => {
    watchActiveTab({ onMessage: () => {}, onDisconnected: () => {} });
    activeTab = { id: 9, windowId: 1 };
    onActivated({ tabId: 9, windowId: 1 });
    onUpdated(9, { status: 'complete' });
    await settle();
    expect(ports.map((port) => port.tabId)).toEqual([9]);
  });
});
