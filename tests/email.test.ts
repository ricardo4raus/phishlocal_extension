import { describe, expect, it } from 'vitest';
import {
  type Email,
  isReadEmailRequest,
  isReadEmailResponse,
  MAX_BODY_CHARS,
  MAX_LINKS,
  READ_EMAIL,
} from '../src/email';

const email: Email = {
  sender: { name: 'PayPal', address: 'service@paypa1-secure.example' },
  subject: 'Your account is locked',
  bodyText: 'Confirm your password within 24 hours.',
  links: [{ text: 'paypal.com', href: 'https://paypa1-secure.example/login' }],
  truncated: false,
};

describe('isReadEmailRequest', () => {
  it('accepts the read-email request', () => {
    expect(isReadEmailRequest({ type: READ_EMAIL })).toBe(true);
  });

  it.each([null, undefined, 'phishlocal/read-email', {}, { type: 'other' }])(
    'rejects %j',
    (value) => {
      expect(isReadEmailRequest(value)).toBe(false);
    },
  );
});

describe('isReadEmailResponse', () => {
  it('accepts an email and "no email open"', () => {
    expect(isReadEmailResponse({ ok: true, email })).toBe(true);
    expect(isReadEmailResponse({ ok: false, reason: 'no-email-open' })).toBe(true);
  });

  it.each([
    ['nothing', undefined],
    ['a string', 'ok'],
    ['ok without email', { ok: true }],
    ['an unknown reason', { ok: false, reason: 'other' }],
    ['a missing sender', { ok: true, email: { ...email, sender: undefined } }],
    ['a non-string subject', { ok: true, email: { ...email, subject: 42 } }],
    ['links that are not a list', { ok: true, email: { ...email, links: 'x' } }],
    ['a link without href', { ok: true, email: { ...email, links: [{ text: 'x' }] } }],
    [
      'a body over the limit',
      { ok: true, email: { ...email, bodyText: 'x'.repeat(MAX_BODY_CHARS + 1) } },
    ],
    [
      'too many links',
      {
        ok: true,
        email: { ...email, links: Array.from({ length: MAX_LINKS + 1 }, () => email.links[0]) },
      },
    ],
    ['a missing truncated flag', { ok: true, email: { ...email, truncated: undefined } }],
  ])('rejects %s', (_label, value) => {
    expect(isReadEmailResponse(value)).toBe(false);
  });
});
