import type { Email } from '../email';
import { looksLikeRawEmail, parseRawEmail } from '../raw/parse-raw-email';
import { parsePastedEmail, type PastedEmail } from './parse-pasted-email';

/**
 * Reads what was pasted: raw source ("Show original", "View source") with its headers, or the
 * copied email itself. Raw source carries its own sender and subject, so the fields are ignored
 * then. Throws `RawEmailError` if raw source cannot be read.
 */
export async function readPaste(input: PastedEmail): Promise<{ email: Email; raw: boolean }> {
  if (looksLikeRawEmail(input.text)) {
    return { email: await parseRawEmail(input.text), raw: true };
  }
  return { email: parsePastedEmail(input), raw: false };
}
