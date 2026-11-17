// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Email } from '../src/email';
import { HEADERS_HINT, showEmail } from '../src/sidepanel/email-view';

const email: Email = {
  sender: { name: 'PayPal', address: 'service@paypa1-secure.example' },
  subject: '<img src=x onerror="alert(1)">Your account is locked',
  bodyText: 'Confirm your password: <script>alert(1)</script>',
  links: [{ text: 'paypal.com', href: 'https://paypa1-secure.example/login' }],
  truncated: false,
};

const get = (id: string) => document.getElementById(id) as HTMLElement;

/** Side panel elements for showEmail, in a fresh document. */
function emailElements() {
  document.body.innerHTML = `
    <dl id="details" hidden><dd id="sender"></dd><dd id="subject"></dd><dd id="auth"></dd>
    <div id="rows" hidden><dd id="reply-to"></dd><dd id="return-path"></dd></div>
    <dd><ul id="links"></ul></dd><dd id="body"></dd></dl>`;
  return {
    details: get('details'),
    sender: get('sender'),
    subject: get('subject'),
    auth: get('auth'),
    headerRows: get('rows'),
    replyTo: get('reply-to'),
    returnPath: get('return-path'),
    links: get('links') as HTMLUListElement,
    body: get('body'),
  };
}

describe('showEmail', () => {
  it('shows email content as text, never as HTML', () => {
    const els = emailElements();
    showEmail(email, els);
    expect(els.details.hidden).toBe(false);
    expect(els.subject.textContent).toBe(email.subject);
    expect(els.body.textContent).toBe(email.bodyText);
    expect(document.querySelector('img, script')).toBeNull();
  });

  it('shows sender, link text and real target', () => {
    const els = emailElements();
    showEmail(email, els);
    expect(els.sender.textContent).toBe('PayPal <service@paypa1-secure.example>');
    expect(els.links.textContent).toBe('paypal.com → https://paypa1-secure.example/login');
  });

  it('marks a cut body and says when there are no links', () => {
    const els = emailElements();
    showEmail({ ...email, bodyText: 'x'.repeat(1_500), links: [], truncated: true }, els);
    expect(els.body.textContent).toBe(`${'x'.repeat(1_000)}…`);
    expect(els.links.textContent).toBe('No links');
  });

  it('shows the sender checks, Reply-To and Return-Path of a raw email', () => {
    const els = emailElements();
    showEmail(
      {
        ...email,
        headers: {
          replyTo: [{ name: 'Support <x>', address: 'help@freemail.example' }],
          returnPath: 'bounce@sender-host.example',
          auth: {
            server: 'mx.receiver.example',
            spf: 'fail',
            dkim: [{ result: 'pass', domain: 'mailer.example' }, { result: 'none' }],
            dmarc: 'fail',
          },
        },
      },
      els,
    );
    expect(els.auth.textContent).toBe(
      'SPF fail · DKIM pass (mailer.example), none · DMARC fail, checked by mx.receiver.example',
    );
    expect(els.headerRows.hidden).toBe(false);
    expect(els.replyTo.textContent).toBe('Support <x> <help@freemail.example>');
    expect(els.returnPath.textContent).toBe('bounce@sender-host.example');
  });

  it('says how to get the headers when the email has none', () => {
    const els = emailElements();
    showEmail(email, els);
    expect(els.auth.textContent).toBe(HEADERS_HINT);
    expect(els.headerRows.hidden).toBe(true);
    showEmail({ ...email, headers: { replyTo: [] } }, els);
    expect(els.auth.textContent).toBe('None in the headers: the sender cannot be verified.');
  });

  it('shows direction overrides visibly, so reversed text reads as written', () => {
    const els = emailElements();
    const rlo = String.fromCodePoint(0x202e);
    showEmail({ ...email, sender: { name: `${rlo}moc.lapyap`, address: 'x@evil.example' } }, els);
    expect(els.sender.textContent).toBe('<U+202E>moc.lapyap <x@evil.example>');
  });
});
