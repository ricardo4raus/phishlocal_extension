import type { Email } from '../email';
import type { PastedEmail } from '../paste/parse-pasted-email';
import { readPaste } from '../paste/read-paste';
import { SAMPLE_EMAILS } from '../paste/samples';
import { m } from '../i18n';
import { RawEmailError } from '../raw/parse-raw-email';

/** What the panel says when a paste cannot be read: our own words, never the parser's. */
function pasteError(error: unknown): string {
  if (error instanceof RawEmailError && error.kind === 'too-large') return m.paste.rawTooLarge;
  return m.paste.rawUnreadable;
}

export interface PasteElements {
  sender: HTMLInputElement;
  subject: HTMLInputElement;
  text: HTMLTextAreaElement;
  use: HTMLButtonElement;
  clear: HTMLButtonElement;
  sample: HTMLSelectElement;
  loadSample: HTMLButtonElement;
}

export interface PasteCallbacks {
  /** A pasted or sample email is ready to show. */
  onEmail: (email: Email, status: string) => void;
  onError: (message: string) => void;
  onClear: () => void;
}

/**
 * Wires up the paste area: "Use pasted email", "Clear" and the built-in samples.
 *
 * On paste, the browser inserts the `text/plain` version into the text field; the `text/html`
 * version is kept here only for its links and is parsed with parse5, never inserted into the page.
 * Raw source ("Show original") is recognized and read with its headers. Nothing is stored:
 * everything is gone when the side panel closes.
 */
export function setUpPaste(elements: PasteElements, callbacks: PasteCallbacks): void {
  let pastedHtml: string | undefined;

  elements.text.addEventListener('paste', (event: ClipboardEvent) => {
    pastedHtml = event.clipboardData?.getData('text/html') || undefined;
  });
  // An emptied field starts a new email: links from the old paste must not stick to new text.
  elements.text.addEventListener('input', () => {
    if (elements.text.value.trim() === '') pastedHtml = undefined;
  });

  for (const sample of SAMPLE_EMAILS) {
    const option = document.createElement('option');
    option.value = sample.id;
    option.textContent = sample.label;
    elements.sample.append(option);
  }

  /** Counts readings; Clear also counts, so a reading that finishes after Clear is dropped. */
  let reading = 0;
  const setBusy = (busy: boolean): void => {
    elements.use.disabled = busy;
    elements.loadSample.disabled = busy;
  };

  /** Reads the input (raw source takes a moment) and reports the email or the error. */
  const show = async (input: PastedEmail, status: (raw: boolean) => string): Promise<void> => {
    const current = ++reading;
    setBusy(true);
    try {
      const { email, raw } = await readPaste(input);
      if (current === reading) callbacks.onEmail(email, status(raw));
    } catch (error) {
      if (current === reading) {
        callbacks.onError(pasteError(error));
      }
    } finally {
      if (current === reading) setBusy(false);
    }
  };

  elements.use.addEventListener('click', () => {
    const text = elements.text.value;
    if (text.trim() === '') {
      callbacks.onError(m.paste.emptyText);
      return;
    }
    void show(
      { text, html: pastedHtml, sender: elements.sender.value, subject: elements.subject.value },
      (raw) => (raw ? m.paste.rawRead : m.paste.ready),
    );
  });

  elements.loadSample.addEventListener('click', () => {
    const sample = SAMPLE_EMAILS.find((candidate) => candidate.id === elements.sample.value);
    if (!sample) {
      callbacks.onError(m.paste.chooseSample);
      return;
    }
    elements.sender.value = sample.email.sender ?? '';
    elements.subject.value = sample.email.subject ?? '';
    elements.text.value = sample.email.text;
    pastedHtml = sample.email.html;
    void show(sample.email, () => m.paste.sampleLoaded(sample.label));
  });

  elements.clear.addEventListener('click', () => {
    elements.sender.value = '';
    elements.subject.value = '';
    elements.text.value = '';
    elements.sample.value = '';
    pastedHtml = undefined;
    reading++;
    setBusy(false);
    callbacks.onClear();
  });
}
