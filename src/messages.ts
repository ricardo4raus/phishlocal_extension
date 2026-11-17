/*
 * Messages between the side panel and the Gmail content script, over one port per Gmail tab.
 *
 * While the side panel is open, it keeps a port to the active tab. The content script then
 * reports every email the user opens, and the "Show original" page with its headers. When the
 * panel closes, the port closes and the content script stops reading.
 *
 * Both sides check every message: the content script reads a page that the email's sender
 * partly controls, and the panel must not trust anything it did not validate.
 */
import { type Email, isEmail, isRecord } from './email';

export const WATCH_PORT = 'phishlocal/watch';

/** Largest "Show original" page that is passed on (the headers are at its start). */
export const MAX_ORIGINAL_CHARS = 1_000_000;

/** Message IDs are short (`msg-f:` plus up to 25 digits); fallback keys are cut to this. */
export const MAX_KEY_CHARS = 120;

/** Panel to content script: read the open email again (the "Read open email" button). */
export interface ScanRequest {
  type: 'scan';
}

/** Why the "Show original" page could not be loaded. */
export type OriginalFailure = 'no-account-key' | 'no-message-id' | 'request-failed' | 'timeout';

const ORIGINAL_FAILURES: readonly string[] = [
  'no-account-key',
  'no-message-id',
  'request-failed',
  'timeout',
] satisfies OriginalFailure[];

/**
 * Content script to panel. `key` identifies the open message, so the panel can match the
 * "Show original" page that arrives later to the email it belongs to.
 */
export type GmailMessage =
  | { type: 'email'; key: string; email: Email }
  | { type: 'original'; key: string; html: string }
  | { type: 'original-failed'; key: string; reason: OriginalFailure }
  | { type: 'no-email' }
  | { type: 'unreadable' };

export const isScanRequest = (value: unknown): value is ScanRequest =>
  isRecord(value) && value.type === 'scan';

const isKey = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_KEY_CHARS;

export function isGmailMessage(value: unknown): value is GmailMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'email':
      return isKey(value.key) && isEmail(value.email);
    case 'original':
      return (
        isKey(value.key) &&
        typeof value.html === 'string' &&
        value.html.length <= MAX_ORIGINAL_CHARS
      );
    case 'original-failed':
      return (
        isKey(value.key) &&
        typeof value.reason === 'string' &&
        ORIGINAL_FAILURES.includes(value.reason)
      );
    case 'no-email':
    case 'unreadable':
      return true;
    default:
      return false;
  }
}
