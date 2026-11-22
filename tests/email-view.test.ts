// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Email } from '../src/email';
import { HEADERS_HINT, senderDomain, senderStatus, showEmail } from '../src/sidepanel/email-view';

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
    <dd><ol id="links"></ol></dd><dd id="body"></dd></dl>`;
  return {
    details: get('details'),
    sender: get('sender'),
    subject: get('subject'),
    auth: get('auth'),
    headerRows: get('rows'),
    replyTo: get('reply-to'),
    returnPath: get('return-path'),
    links: get('links') as HTMLOListElement,
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
    expect(els.links.textContent).toBe(
      'paypa1-secure.examplepaypa1-secure.example/loginText: paypal.com',
    );
    expect(els.links.querySelector('.domain')?.textContent).toBe('paypa1-secure.example');
    expect((els.links.querySelector('.url') as HTMLElement).title).toBe(
      'https://paypa1-secure.example/login',
    );
  });

  it('marks the links named by findings with their most severe finding', () => {
    const els = emailElements();
    const links = [
      { text: 'Home', href: 'https://news.example/' },
      { text: 'Help', href: 'https://www.google.com/url?q=https://evil.example/' },
      { text: '<b>x</b>', href: 'not a link' },
    ];
    showEmail({ ...email, links }, els, {
      findings: [
        { rule: 'redirect-link', severity: 'info', message: 'x', evidence: [], links: [1] },
        { rule: 'lookalike-domain', severity: 'danger', message: 'x', evidence: [], links: [1] },
        { rule: 'urgency', severity: 'warning', message: 'x', evidence: [] },
      ],
    });
    const items = [...els.links.children] as HTMLElement[];
    expect(items.map((item) => item.className)).toEqual(['link', 'link danger', 'link']);
    expect(items[1]?.firstElementChild?.textContent).toBe(
      'Danger: google.com forwards to evil.example',
    );
    expect(items[2]?.textContent).toBe('Not a valid web addressnot a linkText: <b>x</b>');
    expect(document.querySelector('b')).toBeNull();
  });

  it('reveals direction overrides in link texts, URLs and the tooltip', () => {
    const els = emailElements();
    const rlo = String.fromCodePoint(0x202e);
    const href = `https://evil.example/${rlo}fdp.exe`;
    showEmail({ ...email, links: [{ text: `${rlo}moc.lapyap`, href }] }, els);
    expect(els.links.querySelector('.link-text')?.textContent).toBe('Text: <U+202E>moc.lapyap');
    const url = els.links.querySelector('.url') as HTMLElement;
    expect(url.title).toBe('https://evil.example/<U+202E>fdp.exe');
    expect(url.textContent).not.toContain(rlo);
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

/** Headers with every sender check passed, from `server`. */
const pass = (server: string) => ({
  replyTo: [],
  auth: { server, spf: 'pass', dkim: [{ result: 'pass' }], dmarc: 'pass' },
});

describe('senderStatus', () => {
  it("credits Gmail only for headers read from Gmail's own page", () => {
    const gmail = { ...email, headers: pass('mx.google.com') };
    expect(senderStatus(gmail, false, true).text).toBe('Sender confirmed by Gmail');
    // Pasted raw source can say anything: a pasted "mx.google.com" is not Gmail's word.
    expect(senderStatus(gmail, false, false).text).toBe('Sender confirmed by your mail server');
    expect(senderStatus({ ...email, headers: pass('mx.other.example') }, false, true).text).toBe(
      'Sender confirmed by your mail server',
    );
  });

  it('is "not confirmed" without a DMARC pass, and "checking" only while Gmail headers load', () => {
    expect(senderStatus(email).state).toBe('unconfirmed');
    expect(senderStatus(email, true)).toMatchObject({
      state: 'checking',
      text: 'Checking the sender…',
    });
    const failed = {
      ...email,
      headers: { replyTo: [], auth: { server: 'mx.google.com', dkim: [], dmarc: 'fail' } },
    };
    expect(senderStatus(failed, true, true).state).toBe('unconfirmed');
  });

  it('shows the registrable domain of the address, or nothing', () => {
    expect(senderDomain('x@mail.lumorabank.example')).toBe('lumorabank.example');
    expect(senderDomain('')).toBe('');
  });
});
