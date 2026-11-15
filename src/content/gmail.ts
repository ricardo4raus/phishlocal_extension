/*
 * Gmail content script. Runs only on https://mail.google.com/* (see manifest.json).
 *
 * It reads nothing on its own: only when the side panel asks (the user clicked "Read open
 * email") does it read the open email and answer. The email is not stored and not sent anywhere.
 */
import { isReadEmailRequest, type ReadEmailResponse } from '../email';
import { extractEmail } from './gmail-extract';

function readEmail(): ReadEmailResponse {
  try {
    const email = extractEmail(document);
    return email ? { ok: true, email } : { ok: false, reason: 'no-email-open' };
  } catch (error) {
    console.error('PhishLocal: reading the email failed', error);
    return { ok: false, reason: 'unreadable' };
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse: (response: ReadEmailResponse) => void) => {
    // Only our own extension may ask; websites cannot send messages here.
    if (sender.id !== chrome.runtime.id || !isReadEmailRequest(message)) return;
    sendResponse(readEmail());
  },
);
