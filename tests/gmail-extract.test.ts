// @vitest-environment jsdom
/*
 * Tests the Gmail extraction against a made-up Gmail page (no real email, no personal data).
 * The structure follows the Gmail DOM measured on 15 Nov 2026; see SELECTORS.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { extractEmail } from '../src/content/gmail-extract';
import { MAX_BODY_CHARS, MAX_LINKS } from '../src/email';

/**
 * jsdom has no layout, so `innerText` is undefined there. This stand-in is close enough for the
 * tests: it skips `hidden` and inline `display:none` elements. Chrome's real `innerText` decides
 * in the browser, which the manual Chrome test covers.
 */
beforeAll(() => {
  const visible = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    if (node.hidden || node.style.display === 'none') return '';
    return [...node.childNodes].map(visible).join('');
  };
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return visible(this);
    },
  });
});

interface MessageOptions {
  name?: string;
  address?: string;
  body?: string;
  expanded?: boolean;
}

function message({
  name = 'PayPal Service',
  address = 'service@paypa1-secure.example',
  body = 'Please confirm your account.',
  expanded = true,
}: MessageOptions = {}): string {
  return `
    <div role="listitem" class="h7 ie">
      <div class="adn ads" data-message-id="#msg-f:1" data-legacy-message-id="1">
        <span class="gD" email="${address}" name="${name}">${name}</span>
        <span class="go">&lt;${address}&gt;</span>
        <span class="g2" email="me@example.com" name="me">me</span>
        ${expanded ? `<div class="a3s aiL msg1">${body}</div>` : ''}
      </div>
    </div>`;
}

function gmail(messages: string, subject = 'Your account is locked'): Document {
  document.body.innerHTML = `
    <div role="main" class="nH">
      <h2 class="hP" data-thread-perm-id="thread-f:1">${subject}</h2>
      ${messages}
    </div>`;
  return document;
}

describe('extractEmail', () => {
  it('reads sender, subject, body and links', () => {
    const doc = gmail(
      message({
        body: 'Confirm within 24 hours: <a href="https://paypa1-secure.example/login">paypal.com</a>',
      }),
    );
    expect(extractEmail(doc)).toEqual({
      sender: { name: 'PayPal Service', address: 'service@paypa1-secure.example' },
      subject: 'Your account is locked',
      bodyText: 'Confirm within 24 hours: paypal.com',
      links: [{ text: 'paypal.com', href: 'https://paypa1-secure.example/login' }],
      truncated: false,
    });
  });

  it('returns undefined when no email is open (inbox list)', () => {
    document.body.innerHTML =
      '<div role="main" class="nH"><table><tr><td>Inbox</td></tr></table></div>';
    expect(extractEmail(document)).toBeUndefined();
  });

  it('reads the last expanded message of a thread', () => {
    const doc = gmail(
      [
        message({ name: 'First', body: 'first message' }),
        message({ name: 'Second', body: 'second message' }),
        message({ name: 'Collapsed', expanded: false }),
      ].join(''),
    );
    const email = extractEmail(doc);
    expect(email?.sender.name).toBe('Second');
    expect(email?.bodyText).toBe('second message');
  });

  it('takes the sender, not a recipient', () => {
    const email = extractEmail(gmail(message()));
    expect(email?.sender.address).toBe('service@paypa1-secure.example');
  });

  it('uses the fallback selectors', () => {
    document.body.innerHTML = `
      <h2 data-thread-perm-id="thread-f:1">Fallback subject</h2>
      <div data-legacy-message-id="1">
        <span email="x@example.com" name="X">X</span>
        <div class="a3s">text</div>
      </div>`;
    expect(extractEmail(document)).toMatchObject({
      subject: 'Fallback subject',
      sender: { name: 'X', address: 'x@example.com' },
      bodyText: 'text',
    });
  });

  it('skips hidden text, like a reader', () => {
    const email = extractEmail(
      gmail(message({ body: 'Hello<span style="display:none"> hidden trap</span> there' })),
    );
    expect(email?.bodyText).toBe('Hello there');
  });

  it('uses the image alt text for image links and squeezes whitespace', () => {
    const email = extractEmail(
      gmail(
        message({
          body: `<a href="https://x.example/a"><img alt="Log in"></a>
                 <a href="https://x.example/b">  Pay
                   now </a>`,
        }),
      ),
    );
    expect(email?.links).toEqual([
      { text: 'Log in', href: 'https://x.example/a' },
      { text: 'Pay now', href: 'https://x.example/b' },
    ]);
  });

  it('cuts a long body and caps the number of links', () => {
    const links = Array.from(
      { length: MAX_LINKS + 5 },
      (_, i) => `<a href="https://x.example/${i}">l</a>`,
    );
    const email = extractEmail(
      gmail(message({ body: `${'x'.repeat(MAX_BODY_CHARS + 10)}${links.join('')}` })),
    );
    expect(email?.bodyText).toHaveLength(MAX_BODY_CHARS);
    expect(email?.truncated).toBe(true);
    expect(email?.links).toHaveLength(MAX_LINKS);
  });

  it('keeps HTML in the email as text', () => {
    const email = extractEmail(gmail(message(), '&lt;img src=x onerror=alert(1)&gt; Hi'));
    expect(email?.subject).toBe('<img src=x onerror=alert(1)> Hi');
  });
});
