/*
 * Loads Gmail's "Show original" page of the open message, for its headers (SPF, DKIM, DMARC,
 * Reply-To). The page is the same one Gmail opens for ⋮ → "Show original".
 *
 * Undocumented, measured on 16 Nov 2026: the page is
 *   /mail/u/<account>/?ik=<account key>&view=om&permmsgid=msg-f:<message id>
 * and fails (404) without `ik`. The account key is only in Gmail's inline scripts, as the 10th
 * entry of `GLOBALS` (9 commas after `GLOBALS`). If Gmail changes any of this, these functions
 * return nothing or fail, and the side panel says that the headers are not available.
 *
 * Security: the request goes only to the page's own origin (mail.google.com), without
 * redirects, with a size and time limit. Script text is only read, never run.
 */
import { MAX_ORIGINAL_CHARS, type OriginalFailure } from '../messages';

/** Where `GLOBALS` starts in Gmail's inline script. */
const GLOBALS_START = /\bGLOBALS\s*=\s*\[/;
/** The account key follows this many commas after `GLOBALS = [` (measured). */
const COMMAS_BEFORE_KEY = 9;
/** The key is near the start of `GLOBALS`; never scan further than this. */
const MAX_KEY_DISTANCE = 20_000;
const ACCOUNT_KEY = /^\s*"([0-9a-f]{6,16})"/;

/** Gmail's account key (`ik`), or undefined if it cannot be found. */
export function readAccountKey(document: Document): string | undefined {
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent ?? '';
    const match = GLOBALS_START.exec(text);
    if (!match) continue;
    const start = match.index + match[0].length;
    let position = start;
    for (let comma = 0; comma < COMMAS_BEFORE_KEY && position > 0; comma++) {
      position = text.indexOf(',', position) + 1;
    }
    if (position <= 0 || position - start > MAX_KEY_DISTANCE) continue;
    const key = ACCOUNT_KEY.exec(text.slice(position, position + 40))?.[1];
    if (key) return key;
  }
  return undefined;
}

const MESSAGE_ID = /^msg-[af]:\d{1,25}$/;
const LEGACY_ID = /^[0-9a-f]{1,20}$/i;

/** The open message's ID in the form the "Show original" URL needs (`msg-f:<digits>`). */
export function readMessageId(message: Element): string | undefined {
  const id = message.getAttribute('data-message-id')?.replace(/^#/, '');
  if (id && MESSAGE_ID.test(id)) return id;
  // The legacy ID is the same number in hex.
  const legacy = message.getAttribute('data-legacy-message-id');
  if (legacy && LEGACY_ID.test(legacy)) return `msg-f:${BigInt(`0x${legacy}`).toString()}`;
  return undefined;
}

/** The "Show original" URL on the current Gmail origin and account. */
export function originalUrl(location: Location, accountKey: string, messageId: string): URL {
  const account = /^\/mail\/u\/(\d{1,2})\//.exec(location.pathname)?.[1] ?? '0';
  const url = new URL(`/mail/u/${account}/`, location.origin);
  url.searchParams.set('ik', accountKey);
  url.searchParams.set('view', 'om');
  url.searchParams.set('permmsgid', messageId);
  return url;
}

export class OriginalError extends Error {
  constructor(readonly reason: OriginalFailure) {
    super(reason);
  }
}

/** Default time limit for loading the page. */
export const ORIGINAL_TIMEOUT_MS = 10_000;

/** Reads at most `max` characters of a response body, then stops the download. */
async function readLimited(response: Response, max: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, max);
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.length >= max) {
      await reader.cancel();
      return text.slice(0, max);
    }
  }
  return text + decoder.decode();
}

/**
 * Loads the page as text (at most {@link MAX_ORIGINAL_CHARS}; the headers come first, so a cut
 * page still has them). Throws `OriginalError` on any failure.
 */
export async function loadOriginal(
  url: URL,
  { signal, timeoutMs = ORIGINAL_TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new OriginalError(timeout.aborted ? 'timeout' : 'request-failed');
  }
  const sameOrigin = response.url === '' || new URL(response.url).origin === url.origin;
  const html = (response.headers.get('content-type') ?? '').startsWith('text/html');
  if (!response.ok || response.type !== 'basic' || !sameOrigin || !html) {
    throw new OriginalError('request-failed');
  }
  try {
    return await readLimited(response, MAX_ORIGINAL_CHARS);
  } catch {
    throw new OriginalError(timeout.aborted ? 'timeout' : 'request-failed');
  }
}
