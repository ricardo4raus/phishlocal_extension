// @vitest-environment jsdom
/*
 * The Gmail content script's message handler: who may ask, and what it answers.
 * The extraction itself is tested in gmail-extract.test.ts; here it is replaced by a mock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READ_EMAIL, type ReadEmailResponse } from '../src/email';

const extractEmail = vi.hoisted(() => vi.fn<() => unknown>());
vi.mock('../src/content/gmail-extract', () => ({ extractEmail }));

type Listener = (
  message: unknown,
  sender: { id?: string },
  sendResponse: (response: ReadEmailResponse) => void,
) => void;

const OWN_ID = 'own-extension-id';
let listener: Listener;

beforeEach(async () => {
  vi.resetModules();
  extractEmail.mockReset();
  vi.stubGlobal('chrome', {
    runtime: {
      id: OWN_ID,
      onMessage: {
        addListener: (registered: Listener) => {
          listener = registered;
        },
      },
    },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../src/content/gmail');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Sends a message to the registered listener and returns what it answered (if anything). */
function ask(
  message: unknown,
  sender: { id?: string } = { id: OWN_ID },
): ReadEmailResponse | undefined {
  let answer: ReadEmailResponse | undefined;
  listener(message, sender, (response) => {
    answer = response;
  });
  return answer;
}

describe('Gmail content script', () => {
  it('answers our own read-email request with the email', () => {
    extractEmail.mockReturnValue({ subject: 'x' });
    expect(ask({ type: READ_EMAIL })).toEqual({ ok: true, email: { subject: 'x' } });
  });

  it('says when no email is open', () => {
    extractEmail.mockReturnValue(undefined);
    expect(ask({ type: READ_EMAIL })).toEqual({ ok: false, reason: 'no-email-open' });
  });

  it('answers "unreadable" if reading fails', () => {
    extractEmail.mockImplementation(() => {
      throw new Error('Gmail changed');
    });
    expect(ask({ type: READ_EMAIL })).toEqual({ ok: false, reason: 'unreadable' });
  });

  it.each([
    ['another extension', { type: READ_EMAIL }, { id: 'other-extension-id' }],
    ['a sender without id', { type: READ_EMAIL }, {}],
    ['an unknown message', { type: 'other' }, { id: OWN_ID }],
  ])('ignores %s and reads nothing', (_label, message, sender) => {
    expect(ask(message, sender)).toBeUndefined();
    expect(extractEmail).not.toHaveBeenCalled();
  });
});
