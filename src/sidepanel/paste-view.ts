import type { Email } from '../email';
import {
  MAX_PASTE_HTML_CHARS,
  type PastedEmail,
  parsePastedEmail,
} from '../paste/parse-pasted-email';
import { SAMPLE_EMAILS } from '../paste/samples';

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
 * Nothing is stored: everything is gone when the side panel closes.
 */
export function setUpPaste(elements: PasteElements, callbacks: PasteCallbacks): void {
  let pastedHtml: string | undefined;

  elements.text.addEventListener('paste', (event: ClipboardEvent) => {
    pastedHtml = event.clipboardData?.getData('text/html') || undefined;
  });

  for (const sample of SAMPLE_EMAILS) {
    const option = document.createElement('option');
    option.value = sample.id;
    option.textContent = sample.label;
    elements.sample.append(option);
  }

  const show = (input: PastedEmail, status: string): void => {
    callbacks.onEmail(parsePastedEmail(input), status);
  };

  elements.use.addEventListener('click', () => {
    const text = elements.text.value;
    if (text.trim() === '') {
      callbacks.onError('Paste the email text first.');
      return;
    }
    const tooBig = pastedHtml !== undefined && pastedHtml.length > MAX_PASTE_HTML_CHARS;
    show(
      { text, html: pastedHtml, sender: elements.sender.value, subject: elements.subject.value },
      tooBig
        ? 'Pasted email ready. The formatting was too large, so links come from the text only.'
        : 'Pasted email ready. Nothing left your browser.',
    );
  });

  elements.loadSample.addEventListener('click', () => {
    const sample = SAMPLE_EMAILS.find((candidate) => candidate.id === elements.sample.value);
    if (!sample) {
      callbacks.onError('Choose a sample first.');
      return;
    }
    elements.sender.value = sample.email.sender ?? '';
    elements.subject.value = sample.email.subject ?? '';
    elements.text.value = sample.email.text;
    pastedHtml = sample.email.html;
    show(sample.email, `Sample loaded: ${sample.label}. It is made up.`);
  });

  elements.clear.addEventListener('click', () => {
    elements.sender.value = '';
    elements.subject.value = '';
    elements.text.value = '';
    elements.sample.value = '';
    pastedHtml = undefined;
    callbacks.onClear();
  });
}
