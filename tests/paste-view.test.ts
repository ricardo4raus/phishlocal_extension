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

describe('paste area', () => {
  it('uses the pasted text and the links from the pasted HTML', () => {
    paste('Confirm: paypal.com', 'Confirm: <a href="https://evil.example/login">paypal.com</a>');
    elements.sender.value = 'Bank <a@bank.example>';
    elements.subject.value = 'Locked';
    elements.use.click();
    expect(lastEmail()).toMatchObject({
      sender: { name: 'Bank', address: 'a@bank.example' },
      subject: 'Locked',
      bodyText: 'Confirm: paypal.com',
      links: [{ text: 'paypal.com', href: 'https://evil.example/login' }],
    });
    expect(onEmail.mock.calls.at(-1)?.[1]).toMatch(/Nothing left your browser/);
  });

  it('never puts the pasted HTML into the page', () => {
    paste('Hi', '<img src="https://tracker.example/p.gif"><script>parent.pwned = 1</script>');
    elements.use.click();
    expect(document.querySelector('img, script')).toBeNull();
  });

  it('asks for text when the field is empty', () => {
    elements.use.click();
    expect(onError).toHaveBeenCalledWith('Paste the email text first.');
    expect(onEmail).not.toHaveBeenCalled();
  });

  it('says when the HTML was too large to use', () => {
    paste(
      'see https://x.example/a',
      `<a href="https://x.example/b">b</a>${' '.repeat(MAX_PASTE_HTML_CHARS)}`,
    );
    elements.use.click();
    expect(lastEmail()?.links.map((link) => link.href)).toEqual(['https://x.example/a']);
    expect(onEmail.mock.calls.at(-1)?.[1]).toMatch(/too large/);
  });

  it('lists the samples and loads one into the fields', () => {
    const sample = SAMPLE_EMAILS[0]!;
    expect(elements.sample.options).toHaveLength(SAMPLE_EMAILS.length + 1);
    elements.sample.value = sample.id;
    elements.loadSample.click();
    expect(elements.text.value).toBe(sample.email.text);
    expect(elements.sender.value).toBe(sample.email.sender);
    expect(lastEmail()?.links.length).toBeGreaterThan(0);
    expect(onEmail.mock.calls.at(-1)?.[1]).toMatch(/made up/);
  });

  it('asks to choose a sample first', () => {
    elements.loadSample.click();
    expect(onError).toHaveBeenCalledWith('Choose a sample first.');
  });

  it('forgets the pasted HTML when the text field is emptied', () => {
    paste('Hi', '<a href="https://x.example/old">old link</a>');
    elements.text.value = '';
    elements.text.dispatchEvent(new Event('input'));
    elements.text.value = 'a different email, typed';
    elements.use.click();
    expect(lastEmail()?.links).toEqual([]);
  });

  it('clears the fields and forgets the pasted HTML', () => {
    paste('Hi', '<a href="https://x.example/html">html link</a>');
    elements.clear.click();
    expect(elements.text.value).toBe('');
    expect(onClear).toHaveBeenCalled();
    elements.text.value = 'typed later';
    elements.use.click();
    expect(lastEmail()?.links).toEqual([]);
  });
});
