/*
 * Reads an `Authentication-Results` header (RFC 8601), e.g.
 *   mx.example; dkim=pass header.d=bank.example; spf=fail (comment) smtp.mailfrom=x.example;
 *   dmarc=fail (p=REJECT) header.from=bank.example
 *
 * Header values are attacker-controlled. The reader walks each character once (no regex
 * backtracking over the whole value) and keeps only the method results and DKIM domains.
 */
import type { AuthResults } from '../email';

/** At most this many DKIM results are kept from one header. */
const MAX_DKIM_RESULTS = 10;

/** Removes `(comments)`, which may nest, outside of `"quoted strings"`. */
function stripComments(value: string): string {
  let out = '';
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '\\') {
      if (depth === 0) out += value.slice(i, i + 2);
      i++;
    } else if (quoted) {
      out += char;
      if (char === '"') quoted = false;
    } else if (char === '(') {
      depth++;
    } else if (char === ')' && depth > 0) {
      depth--;
    } else if (depth === 0) {
      out += char;
      if (char === '"') quoted = true;
    }
  }
  return out;
}

/** Splits at `;` outside of quoted strings. */
function splitStatements(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    if (char === ';' && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

const RESULT = /^\s*([a-z0-9-]+)(?:\/\d+)?\s*=\s*([a-z]+)(.*)$/is;
const DKIM_DOMAIN = /(?:^|\s)header\.d\s*=\s*"?([a-z0-9.-]+)/i;
const DKIM_IDENTITY = /(?:^|\s)header\.i\s*=\s*"?[^\s@";]*@([a-z0-9.-]+)/i;
const SERVER = /^[a-z0-9.-]{1,253}$/i;

function dkimDomain(properties: string): string | undefined {
  return (DKIM_DOMAIN.exec(properties)?.[1] ?? DKIM_IDENTITY.exec(properties)?.[1])?.toLowerCase();
}

/** The checks in one `Authentication-Results` value, or undefined if it cannot be read. */
export function parseAuthResults(value: string): AuthResults | undefined {
  const [first = '', ...statements] = splitStatements(stripComments(value));
  const server = first.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!SERVER.test(server)) return undefined;

  const results: AuthResults = { server, dkim: [] };
  for (const statement of statements) {
    const match = RESULT.exec(statement);
    if (!match) continue;
    const method = (match[1] ?? '').toLowerCase();
    const result = (match[2] ?? '').toLowerCase();
    if (method === 'spf') results.spf ??= result;
    else if (method === 'dmarc') results.dmarc ??= result;
    else if (method === 'dkim' && results.dkim.length < MAX_DKIM_RESULTS) {
      const domain = dkimDomain(match[3] ?? '');
      results.dkim.push(domain ? { result, domain } : { result });
    }
  }
  return results;
}
