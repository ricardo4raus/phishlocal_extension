import { describe, expect, it } from 'vitest';
import { type Email, FIELD_LIMITS, isEmail, MAX_BODY_CHARS, MAX_LINKS } from '../src/email';

const email: Email = {
  sender: { name: 'PayPal', address: 'service@paypa1-secure.example' },
  subject: 'Your account is locked',
  bodyText: 'Confirm your password within 24 hours.',
  links: [{ text: 'paypal.com', href: 'https://paypa1-secure.example/login' }],
  truncated: false,
};

describe('isEmail', () => {
  it('accepts a complete email', () => {
    expect(isEmail(email)).toBe(true);
  });

  it.each([
    ['nothing', undefined],
    ['a string', 'ok'],
    ['a missing sender', { ...email, sender: undefined }],
    ['a non-string subject', { ...email, subject: 42 }],
    ['links that are not a list', { ...email, links: 'x' }],
    ['a link without href', { ...email, links: [{ text: 'x' }] }],
    ['a body over the limit', { ...email, bodyText: 'x'.repeat(MAX_BODY_CHARS + 1) }],
    [
      'too many links',
      { ...email, links: Array.from({ length: MAX_LINKS + 1 }, () => email.links[0]) },
    ],
    ['a missing truncated flag', { ...email, truncated: undefined }],
    ['a subject over the limit', { ...email, subject: 'x'.repeat(FIELD_LIMITS.subject + 1) }],
    [
      'a sender name over the limit',
      { ...email, sender: { name: 'x'.repeat(FIELD_LIMITS.name + 1), address: '' } },
    ],
    [
      'an address over the limit',
      { ...email, sender: { name: '', address: 'x'.repeat(FIELD_LIMITS.address + 1) } },
    ],
    [
      'a link text over the limit',
      {
        ...email,
        links: [{ text: 'x'.repeat(FIELD_LIMITS.linkText + 1), href: 'https://x.example' }],
      },
    ],
    [
      'a link target over the limit',
      { ...email, links: [{ text: 'x', href: 'x'.repeat(FIELD_LIMITS.href + 1) }] },
    ],
  ])('rejects %s', (_label, value) => {
    expect(isEmail(value)).toBe(false);
  });
});
