// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Email } from '../src/email';
import { MAX_PASTE_HTML_CHARS } from '../src/paste/parse-pasted-email';
import { SAMPLE_EMAILS } from '../src/paste/samples';
import { type PasteElements, setUpPaste } from '../src/sidepanel/paste-view';

let elements: PasteElements;
const onEmail = vi.fn<(email: Email, status: string) => void>();
const onError = vi.fn<(message: string) => void>();
const onClear = vi.fn<() => void>();

const get = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

beforeEach(() => {
  onEmail.mockReset();
  onError.mockReset();
  onClear.mockReset();
  document.body.innerHTML = `
    <input id="sender"><input id="subject"><textarea id="text"></textarea>
    <button id="use"></button><button id="clear"></button>
    <select id="sample"><option value="">Choose…</option></select><button id="load"></button>`;
  elements = {
    sender: get('sender'),
    subject: get('subject'),
    text: get('text'),
    use: get('use'),
    clear: get('clear'),
    sample: get('sample'),
    loadSample: get('load'),
  };
  setUpPaste(elements, { onEmail, onError, onClear });
});

/** Simulates pasting: the browser puts text/plain into the field, we keep text/html. */
function paste(text: string, html?: string): void {
  const event = new Event('paste');
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/html' ? (html ?? '') : text) },
  });
  elements.text.dispatchEvent(event);
  elements.text.value = text;
}

const lastEmail = (): Email | undefined => onEmail.mock.calls.at(-1)?.[0];

/** Clicks and waits until the (asynchronous) handler has reported an email or an error. */
async function click(button: HTMLButtonElement): Promise<void> {
  const before = onEmail.mock.calls.length + onError.mock.calls.length;
  button.click();
  await vi.waitFor(() => {
    expect(onEmail.mock.calls.length + onError.mock.calls.length).toBeGreaterThan(before);
  });
}

describe('paste area', () => {
  it('uses the pasted text and the links from the pasted HTML', async () => {
    paste('Confirm: paypal.com', 'Confirm: <a href="https://evil.example/login">paypal.com</a>');
    elements.sender.value = 'Bank <a@bank.example>';
    elements.subject.value = 'Locked';
    await click(elements.use);
    expect(lastEmail()).toMatchObject({
      sender: { name: 'Bank', address: 'a@bank.example' },
      subject: 'Locked',
      bodyText: 'Confirm: paypal.com',
      links: [{ text: 'paypal.com', href: 'https://evil.example/login' }],
    });
    expect(onEmail.mock.calls.at(-1)?.[1]).toMatch(/Nothing left your browser/);
  });

  it('never puts the pasted HTML into the page', async () => {
    paste('Hi', '<img src="https://tracker.example/p.gif"><script>parent.pwned = 1</script>');
    await click(elements.use);
    expect(document.querySelector('img, script')).toBeNull();
  });

  it('asks for text when the field is empty', async () => {
    await click(elements.use);
    expect(onError).toHaveBeenCalledWith('Paste the email text first.');
    expect(onEmail).not.toHaveBeenCalled();
  });

  it('marks the email incomplete when the HTML is too large', async () => {
    paste(
      'see https://x.example/a',
      `<a href="https://x.example/b">b</a>${' '.repeat(MAX_PASTE_HTML_CHARS)}`,
    );
    await click(elements.use);
    expect(lastEmail()?.incomplete).toBe(true);
    expect(lastEmail()?.links.map((link) => link.href)).toEqual([
      'https://x.example/b',
      'https://x.example/a',
    ]);
  });

  it('lists the samples and loads one into the fields', async () => {
    const sample = SAMPLE_EMAILS[0]!;
    expect(elements.sample.options).toHaveLength(SAMPLE_EMAILS.length + 1);
    elements.sample.value = sample.id;
    await click(elements.loadSample);
    expect(elements.text.value).toBe(sample.email.text);
    expect(elements.sender.value).toBe(sample.email.sender);
    expect(lastEmail()?.links.length).toBeGreaterThan(0);
    expect(onEmail.mock.calls.at(-1)?.[1]).toMatch(/made up/);
  });

  it('reads pasted raw source with its headers and ignores the fields', async () => {
    paste(
      [
        'Authentication-Results: mx.receiver.example; spf=pass; dkim=none; dmarc=fail',
        'From: Lumora Bank <security@lumorabank.example>',
        'Reply-To: help@freemail.example',
        'Subject: Card blocked',
        '',
        'Confirm your identity.',
      ].join('\r\n'),
    );
    elements.sender.value = 'typed <typed@other.example>';
    await click(elements.use);
    expect(lastEmail()).toMatchObject({
      sender: { name: 'Lumora Bank', address: 'security@lumorabank.example' },
      subject: 'Card blocked',
      headers: { auth: { dmarc: 'fail' }, replyTo: [{ address: 'help@freemail.example' }] },
    });
    expect(onEmail.mock.calls.at(-1)?.[1]).toMatch(/with its headers/);
  });

  it('reports raw source it cannot read and enables the buttons again', async () => {
    // 30 nested parts: more than the parser's limit of 20.
    const nested = Array.from(
      { length: 30 },
      (_, i) => `Content-Type: multipart/mixed; boundary="b${i}"\r\n\r\n--b${i}\r\n`,
    ).join('');
    paste(`From: a@x.example\r\nReceived: x\r\n${nested}`);
    await click(elements.use);
    expect(onError.mock.calls.at(-1)?.[0]).toMatch(/could not be read/);
    expect(elements.use.disabled).toBe(false);
  });

  it('drops a reading that finishes after Clear', async () => {
    paste(['From: a@x.example', 'Received: x', 'Subject: Old', '', 'Old email'].join('\r\n'));
    elements.use.click();
    elements.clear.click();
    expect(elements.use.disabled).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(onEmail).not.toHaveBeenCalled();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('loads the raw sample with its headers', async () => {
    elements.sample.value = 'phishing-raw-dmarc-en';
    await click(elements.loadSample);
    expect(lastEmail()?.headers?.auth?.dmarc).toBe('fail');
  });

  it('asks to choose a sample first', async () => {
    await click(elements.loadSample);
    expect(onError).toHaveBeenCalledWith('Choose a sample first.');
  });

  it('forgets the pasted HTML when the text field is emptied', async () => {
    paste('Hi', '<a href="https://x.example/old">old link</a>');
    elements.text.value = '';
    elements.text.dispatchEvent(new Event('input'));
    elements.text.value = 'a different email, typed';
    await click(elements.use);
    expect(lastEmail()?.links).toEqual([]);
  });

  it('clears the fields and forgets the pasted HTML', async () => {
    paste('Hi', '<a href="https://x.example/html">html link</a>');
    elements.clear.click();
    expect(elements.text.value).toBe('');
    expect(onClear).toHaveBeenCalled();
    elements.text.value = 'typed later';
    await click(elements.use);
    expect(lastEmail()?.links).toEqual([]);
  });
});
