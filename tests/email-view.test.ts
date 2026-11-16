// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Email, READ_EMAIL } from '../src/email';
import { HEADERS_HINT, readOpenEmail, showEmail } from '../src/sidepanel/email-view';

const email: Email = {
  sender: { name: 'PayPal', address: 'service@paypa1-secure.example' },
  subject: '<img src=x onerror="alert(1)">Your account is locked',
  bodyText: 'Confirm your password: <script>alert(1)</script>',
  links: [{ text: 'paypal.com', href: 'https://paypa1-secure.example/login' }],
  truncated: false,
};

/** Replaces the parts of the chrome API that readOpenEmail uses. `tabs`: the active tabs found. */
function stubChrome(
  sendMessage: () => Promise<unknown>,
  tabs: { id?: number }[] = [{ id: 7 }],
): void {
  vi.stubGlobal('chrome', {
    tabs: {
      query: vi.fn<() => Promise<{ id?: number }[]>>(async () => tabs),
      sendMessage: vi.fn<() => Promise<unknown>>(sendMessage),
    },
  });
}

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readOpenEmail', () => {
  it('asks the active tab and returns the email', async () => {
    stubChrome(async () => ({ ok: true, email }));
    expect(await readOpenEmail()).toEqual({ ok: true, email });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, { type: READ_EMAIL });
  });

  it('explains what to do if the tab has no Gmail content script', async () => {
    stubChrome(async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    });
    const result = await readOpenEmail();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/Open an email in Gmail/);
  });

  it('reports when no email is open', async () => {
    stubChrome(async () => ({ ok: false, reason: 'no-email-open' }));
    const result = await readOpenEmail();
    expect(!result.ok && result.message).toMatch(/No email is open/);
  });

  it('reports when Gmail could not be read', async () => {
    stubChrome(async () => ({ ok: false, reason: 'unreadable' }));
    const result = await readOpenEmail();
    expect(!result.ok && result.message).toMatch(/Could not read this email/);
  });

  it('rejects an answer with the wrong shape', async () => {
    stubChrome(async () => ({ ok: true, email: { subject: 1 } }));
    const result = await readOpenEmail();
    expect(!result.ok && result.message).toMatch(/Unexpected answer/);
  });

  it.each([[[]], [[{}]]])('handles a missing active tab (%j)', async (tabs) => {
    stubChrome(async () => ({ ok: true, email }), tabs);
    expect((await readOpenEmail()).ok).toBe(false);
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});

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
