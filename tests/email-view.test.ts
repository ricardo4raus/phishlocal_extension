// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Email, READ_EMAIL } from '../src/email';
import { readOpenEmail, showEmail } from '../src/sidepanel/email-view';

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
    <dl id="details" hidden><dd id="sender"></dd><dd id="subject"></dd>
    <dd><ul id="links"></ul></dd><dd id="body"></dd></dl>`;
  return {
    details: get('details'),
    sender: get('sender'),
    subject: get('subject'),
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
});
