// @vitest-environment jsdom
/*
 * Account key and message ID, read from a made-up Gmail page. The structure follows the Gmail
 * page measured on 16 Nov 2026 (see src/content/gmail-original.ts); no real values.
 */
import { describe, expect, it } from 'vitest';
import { originalUrl, readAccountKey, readMessageId } from '../src/content/gmail-original';

function page(...scripts: string[]): Document {
  document.head.replaceChildren(
    ...scripts.map((text) => {
      const script = document.createElement('script');
      script.textContent = text;
      return script;
    }),
  );
  return document;
}

/** A GLOBALS list like Gmail's: the key is the 10th entry. */
const globals = (key: string, before = '0,"a",null,1,"b",2,"c",3,"d"') =>
  `var GLOBALS=[${before},"${key}",11,"x"];`;

describe('readAccountKey', () => {
  it('reads the 10th entry of GLOBALS', () => {
    expect(readAccountKey(page('var other=1;', globals('a1b2c3d4e5')))).toBe('a1b2c3d4e5');
  });

  it.each([
    ['no GLOBALS', 'var x=["a1b2c3d4e5"];'],
    ['not hex', globals('not-a-key!')],
    ['too short', globals('a1b2')],
    ['too long', globals('a1b2c3d4e5f6a7b8c9')],
    ['too few entries', 'var GLOBALS=[1,2,"a1b2c3d4e5"];'],
    ['a key far away', `var GLOBALS=[${',0'.repeat(8)}${' '.repeat(30_000)},"a1b2c3d4e5"];`],
  ])('finds nothing with %s', (_label, script) => {
    expect(readAccountKey(page(script))).toBeUndefined();
  });

  it('stays fast on a huge script', () => {
    const start = performance.now();
    readAccountKey(page(`var GLOBALS=[${'"x",'.repeat(200_000)}];`));
    expect(performance.now() - start).toBeLessThan(500);
  });
});

function message(attributes: Record<string, string>): Element {
  const element = document.createElement('div');
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

describe('readMessageId', () => {
  it('reads data-message-id', () => {
    expect(readMessageId(message({ 'data-message-id': '#msg-f:1882038068549002049' }))).toBe(
      'msg-f:1882038068549002049',
    );
  });

  it('falls back to the hex legacy ID', () => {
    expect(readMessageId(message({ 'data-legacy-message-id': '1a1e9c4cdd3a8e41' }))).toBe(
      `msg-f:${BigInt('0x1a1e9c4cdd3a8e41').toString()}`,
    );
  });

  it.each<Record<string, string>>([
    { 'data-message-id': '#msg-f:12&ik=evil' },
    { 'data-message-id': 'msg-x:1' },
    { 'data-legacy-message-id': 'zz' },
    { 'data-legacy-message-id': '1'.repeat(21) },
    {},
  ])('rejects %j', (attributes) => {
    expect(readMessageId(message(attributes))).toBeUndefined();
  });
});

const gmailLocation = (pathname: string) =>
  ({ origin: 'https://mail.google.com', pathname }) as Location;

describe('originalUrl', () => {
  it('builds the Show original URL for the current account', () => {
    expect(
      originalUrl(gmailLocation('/mail/u/1/'), 'a1b2c3d4e5', 'msg-f:1882038068549002049').href,
    ).toBe(
      'https://mail.google.com/mail/u/1/?ik=a1b2c3d4e5&view=om&permmsgid=msg-f%3A1882038068549002049',
    );
  });

  it('uses account 0 when the path has none, and stays on the same origin', () => {
    const url = originalUrl(gmailLocation('/mail/'), 'a1b2c3d4e5', 'msg-f:1');
    expect(url.origin).toBe('https://mail.google.com');
    expect(url.pathname).toBe('/mail/u/0/');
  });
});
