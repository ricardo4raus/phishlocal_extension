// Runs in Node without a DOM on purpose: the parser must work with parse5 alone, so it cannot
// create elements, load images or run scripts from a pasted email.
import { describe, expect, it } from 'vitest';
import { MAX_BODY_CHARS, MAX_LINKS } from '../src/email';
import { MAX_PASTE_HTML_CHARS, parsePastedEmail } from '../src/paste/parse-pasted-email';

describe('parsePastedEmail', () => {
  it('runs without a DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof DOMParser).toBe('undefined');
  });

  it('takes the text from text/plain and the links from text/html', () => {
    const email = parsePastedEmail({
      text: 'Your account is locked.\nConfirm here: paypal.com',
      html: '<p>Your account is locked.</p><p>Confirm here: <a href="https://paypa1-secure.example/login">paypal.com</a></p>',
      sender: 'PayPal Service <service@paypa1-secure.example>',
      subject: '  Action   required ',
    });
    expect(email).toEqual({
      sender: { name: 'PayPal Service', address: 'service@paypa1-secure.example' },
      subject: 'Action required',
      bodyText: 'Your account is locked.\nConfirm here: paypal.com',
      links: [{ text: 'paypal.com', href: 'https://paypa1-secure.example/login' }],
      truncated: false,
    });
  });

  it('finds URLs in plain text, without trailing punctuation', () => {
    const email = parsePastedEmail({
      text: 'Go to https://bank.example/verify. Or www.bank.example/help, (see http://x.example/a)!',
    });
    expect(email.links.map((link) => link.href)).toEqual([
      'https://bank.example/verify',
      'www.bank.example/help',
      'http://x.example/a',
    ]);
  });

  it('does not list a URL twice when it is in the HTML and the text', () => {
    const email = parsePastedEmail({
      text: 'Visit https://x.example/a',
      html: '<a href="https://x.example/a">https://x.example/a</a>',
    });
    expect(email.links).toEqual([{ text: 'https://x.example/a', href: 'https://x.example/a' }]);
  });

  it('keeps scripts, images and event handlers as inert data', () => {
    const email = parsePastedEmail({
      text: 'Hello',
      html: `<script>globalThis.pwned = true</script>
             <img src="https://tracker.example/pixel.gif" onerror="globalThis.pwned = true">
             <a href="javascript:alert(1)"><img alt="Click me" src="https://tracker.example/b.gif"></a>`,
    });
    expect((globalThis as { pwned?: boolean }).pwned).toBeUndefined();
    expect(email.links).toEqual([{ text: 'Click me', href: 'javascript:alert(1)' }]);
  });

  it('reads links inside <template> and decodes character references', () => {
    const email = parsePastedEmail({
      text: 'x',
      html: '<template><a href="https&#58;//evil.example/">Bank</a></template>',
    });
    expect(email.links).toEqual([{ text: 'Bank', href: 'https://evil.example/' }]);
  });

  it.each([
    ['Name <a@b.example>', { name: 'Name', address: 'a@b.example' }],
    ['"Bank, Support" <a@b.example>', { name: 'Bank, Support', address: 'a@b.example' }],
    ['<a@b.example>', { name: '', address: 'a@b.example' }],
    ['a@b.example', { name: '', address: 'a@b.example' }],
    ['Just A Name', { name: 'Just A Name', address: '' }],
    ['', { name: '', address: '' }],
  ])('reads the sender %j', (sender, expected) => {
    expect(parsePastedEmail({ text: 'x', sender }).sender).toEqual(expected);
  });

  it('cuts a long text and caps the links', () => {
    const urls = Array.from({ length: MAX_LINKS + 5 }, (_, i) => `https://x.example/${i}`);
    const email = parsePastedEmail({ text: `${urls.join(' ')} ${'x'.repeat(MAX_BODY_CHARS)}` });
    expect(email.bodyText).toHaveLength(MAX_BODY_CHARS);
    expect(email.truncated).toBe(true);
    expect(email.links).toHaveLength(MAX_LINKS);
  });

  it('ignores HTML over the size limit and still finds URLs in the text', () => {
    const html = `<a href="https://x.example/html">x</a>${' '.repeat(MAX_PASTE_HTML_CHARS)}`;
    const email = parsePastedEmail({ text: 'see https://x.example/text', html });
    expect(email.links).toEqual([
      { text: 'https://x.example/text', href: 'https://x.example/text' },
    ]);
  });
});
