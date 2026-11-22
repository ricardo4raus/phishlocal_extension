// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Email } from '../src/email';
import type { Finding } from '../src/rules';
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
    <dd id="body"></dd></dl>
    <section id="links-section" hidden><span id="links-count"></span><ol id="links"></ol>
    <details id="more"><summary id="more-summary"></summary><ol id="more-list"></ol></details></section>`;
  return {
    details: get('details'),
    sender: get('sender'),
    subject: get('subject'),
    auth: get('auth'),
    headerRows: get('rows'),
    replyTo: get('reply-to'),
    returnPath: get('return-path'),
    body: get('body'),
    links: {
      section: get('links-section'),
      count: get('links-count'),
      flagged: get('links') as HTMLOListElement,
      more: get('more') as HTMLDetailsElement,
      moreSummary: get('more-summary'),
      moreList: get('more-list') as HTMLOListElement,
    },
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

  it('shows the sender, and an unflagged link under the fold with its real target', () => {
    const els = emailElements();
    showEmail(email, els);
    expect(els.sender.textContent).toBe('PayPal <service@paypa1-secure.example>');
    expect(els.links.section.hidden).toBe(false);
    expect(els.links.count.textContent).toBe('1');
    expect(els.links.flagged.children).toHaveLength(0);
    expect(els.links.moreSummary.textContent).toBe('Show the 1 link');
    expect(els.links.moreList.textContent).toBe('paypa1-secure.examplepaypa1-secure.example/login');
    expect(els.links.moreList.querySelector('.link__domain')?.textContent).toBe(
      'paypa1-secure.example',
    );
    expect((els.links.moreList.querySelector('.link__url') as HTMLElement).title).toBe(
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
    // The flagged link is a row of its own; the others wait under "2 more links".
    const flagged = [...els.links.flagged.children] as HTMLElement[];
    expect(flagged.map((item) => item.className)).toEqual(['link link--danger']);
    expect(flagged[0]?.firstElementChild?.textContent).toBe(
      'Dangergoogle.comforwards toevil.example',
    );
    const rest = [...els.links.moreList.children] as HTMLElement[];
    expect(rest.map((item) => item.className)).toEqual(['link', 'link']);
    expect(els.links.moreSummary.textContent).toBe('2 more links');
    expect(rest[1]?.textContent).toBe('Not a valid web addressnot a link');
    // The link text appears only in the red-flag row, never here.
    expect(els.links.section.textContent).not.toContain('<b>x</b>');
    expect(document.querySelector('b')).toBeNull();
  });

  it('does not flag a link for a note, and keeps the fold open for the same email', () => {
    const els = emailElements();
    const links = [
      { text: 'Help', href: 'https://www.google.com/url?q=https://evil.example/' },
      { text: 'Home', href: 'https://news.example/' },
    ];
    const note = {
      rule: 'redirect-link',
      severity: 'info',
      message: 'x',
      evidence: [],
      links: [0],
    };
    showEmail({ ...email, links }, els, { findings: [note as Finding] });
    expect(els.links.flagged.children).toHaveLength(0);
    expect(els.links.moreList.children).toHaveLength(2);
    // The user opens the fold; Gmail shows the same email again with its headers.
    els.links.more.open = true;
    showEmail({ ...email, links, headers: { replyTo: [] } }, els, { findings: [] });
    expect(els.links.more.open).toBe(true);
    // Another email closes it.
    showEmail({ ...email, links: [links[1]!] }, els);
    expect(els.links.more.open).toBe(false);
  });

  it('reveals direction overrides in URLs and the tooltip', () => {
    const els = emailElements();
    const rlo = String.fromCodePoint(0x202e);
    const href = `https://evil.example/${rlo}fdp.exe`;
    showEmail({ ...email, links: [{ text: `${rlo}moc.lapyap`, href }] }, els);
    const url = els.links.moreList.querySelector('.link__url') as HTMLElement;
    expect(url.title).toBe('https://evil.example/<U+202E>fdp.exe');
    expect(url.textContent).not.toContain(rlo);
  });

  it('marks a cut body and says when there are no links', () => {
    const els = emailElements();
    showEmail({ ...email, bodyText: 'x'.repeat(1_500), links: [], truncated: true }, els);
    expect(els.body.textContent).toBe(`${'x'.repeat(1_000)}…`);
    expect(els.links.section.hidden).toBe(true);
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
