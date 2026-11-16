/*
 * The Gmail content script's entry point: who may connect. The watcher itself is tested in
 * gmail-watch.test.ts; here it is replaced by a mock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const watchGmail = vi.hoisted(() => vi.fn<(port: unknown) => void>());
vi.mock('../src/content/gmail-watch', () => ({ watchGmail }));

interface FakePort {
  name: string;
  sender?: { id?: string };
  disconnect: () => void;
}

const OWN_ID = 'own-extension-id';
let onConnect: (port: FakePort) => void;

const watchPort = (id?: string, name = 'phishlocal/watch'): FakePort => ({
  name,
  sender: { id },
  disconnect: vi.fn<() => void>(),
});

beforeEach(async () => {
  vi.resetModules();
  watchGmail.mockReset();
  vi.stubGlobal('chrome', {
    runtime: {
      id: OWN_ID,
      onConnect: {
        addListener: (registered: (port: FakePort) => void) => {
          onConnect = registered;
        },
      },
    },
  });
  await import('../src/content/gmail');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Gmail content script', () => {
  it('watches Gmail for a connection from our own extension', () => {
    const own = watchPort(OWN_ID);
    onConnect(own);
    expect(watchGmail).toHaveBeenCalledWith(own);
    expect(own.disconnect).not.toHaveBeenCalled();
  });

  it.each([
    ['another extension', watchPort('other-extension')],
    ['a sender without id', watchPort(undefined)],
    ['another port name', watchPort(OWN_ID, 'other')],
  ])('closes the connection from %s and reads nothing', (_label, port) => {
    onConnect(port);
    expect(watchGmail).not.toHaveBeenCalled();
    expect(port.disconnect).toHaveBeenCalled();
  });
});
