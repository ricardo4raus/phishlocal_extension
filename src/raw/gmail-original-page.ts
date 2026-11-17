/*
 * Headers from Gmail's "Show original" page, which the content script loads in the background.
 * The page is parsed here in the side panel with parse5 (never in Gmail's page, never with
 * DOMParser), and only its header block is read.
 */
import type { EmailHeaders } from '../email';
import { preText } from '../paste/parse-pasted-email';
import { parseRawEmail } from './parse-raw-email';

/** Gmail's receiving server; it adds the topmost `Authentication-Results` to every email. */
export const GMAIL_SERVER = 'mx.google.com';

/**
 * The headers of the raw email on the page, or undefined if the page has none or cannot be
 * read. Sender checks count only if Gmail's own server wrote the topmost result: anything else
 * on top would mean the page is not what we expect.
 */
export async function headersFromOriginalPage(html: string): Promise<EmailHeaders | undefined> {
  const raw = preText(html);
  if (!raw) return undefined;
  const end = raw.search(/\r?\n\r?\n/);
  const head = end < 0 ? raw : raw.slice(0, end);
  let headers: EmailHeaders | undefined;
  try {
    headers = (await parseRawEmail(`${head}\r\n\r\n`)).headers;
  } catch {
    return undefined;
  }
  if (!headers?.auth || headers.auth.server === GMAIL_SERVER) return headers;
  return {
    replyTo: headers.replyTo,
    ...(headers.returnPath ? { returnPath: headers.returnPath } : {}),
  };
}
