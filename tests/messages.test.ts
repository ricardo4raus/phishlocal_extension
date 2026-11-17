import { describe, expect, it } from 'vitest';
import type { Email } from '../src/email';
import { isGmailMessage, isScanRequest, MAX_KEY_CHARS, MAX_ORIGINAL_CHARS } from '../src/messages';

const email: Email = {
  sender: { name: 'Lumora Bank', address: 'news@lumorabank.example' },
  subject: 'Statement',
  bodyText: 'Hello',
  links: [],
  truncated: false,
};

describe('isScanRequest', () => {
  it('accepts only the scan request', () => {
    expect(isScanRequest({ type: 'scan' })).toBe(true);
    expect(isScanRequest({ type: 'other' })).toBe(false);
    expect(isScanRequest('scan')).toBe(false);
  });
});

describe('isGmailMessage', () => {
  it.each([
    { type: 'email', key: 'msg-f:1', email },
    { type: 'original', key: 'msg-f:1', html: '<pre>raw</pre>' },
    { type: 'original-failed', key: 'msg-f:1', reason: 'timeout' },
    { type: 'no-email' },
    { type: 'unreadable' },
  ])('accepts %j', (message) => {
    expect(isGmailMessage(message)).toBe(true);
  });

  it.each([
    ['nothing', undefined],
    ['an unknown type', { type: 'other' }],
    ['an email without key', { type: 'email', email }],
    ['an empty key', { type: 'email', key: '', email }],
    ['a key over the limit', { type: 'email', key: 'k'.repeat(MAX_KEY_CHARS + 1), email }],
    ['a broken email', { type: 'email', key: 'k', email: { ...email, links: 'x' } }],
    ['a page that is not text', { type: 'original', key: 'k', html: 42 }],
    [
      'a page over the limit',
      { type: 'original', key: 'k', html: 'x'.repeat(MAX_ORIGINAL_CHARS + 1) },
    ],
    ['an unknown failure', { type: 'original-failed', key: 'k', reason: 'other' }],
  ])('rejects %s', (_label, message) => {
    expect(isGmailMessage(message)).toBe(false);
  });
});
