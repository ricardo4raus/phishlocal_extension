/*
 * Rule checks: plain TypeScript, no AI, no network. They run on the device in milliseconds, and
 * their findings will be fed into the AI prompt.
 */
import type { Email } from '../email';
import { checkHeaders } from './headers';
import { checkLinks } from './links';
import { checkLookalikes } from './lookalike';
import { checkPhrases } from './phrases';
import { checkSender } from './sender';
import type { Finding, Severity } from './types';
import { checkUnicode } from './unicode';

export type { Finding, Severity } from './types';

/** Upper limit for findings per email, so a hostile email cannot flood the panel or prompt. */
export const MAX_FINDINGS = 30;

const ORDER: Record<Severity, number> = { danger: 0, warning: 1, info: 2 };

/** Part of the HTML was not read: hostile emails pad or nest their HTML to slip past checks. */
const INCOMPLETE: Finding = {
  rule: 'incomplete-check',
  severity: 'warning',
  message:
    'Part of this email could not be checked: its formatting is too large or too deeply nested. Hostile emails do that to hide from checks; treat it with care.',
  evidence: [],
};

/** All findings for an email: the most severe first, each one once. */
export function checkEmail(email: Email): Finding[] {
  const findings: Finding[] = [
    ...(email.incomplete ? [INCOMPLETE] : []),
    ...checkHeaders(email),
    ...checkSender(email.sender),
    ...checkLookalikes(email),
    ...checkLinks(email.links),
    ...checkPhrases(email),
    ...checkUnicode(email),
  ];
  const unique = new Map<string, Finding>();
  for (const finding of findings) {
    const key = `${finding.rule}\n${finding.message}`;
    const known = unique.get(key);
    if (!known) {
      unique.set(key, finding);
    } else if (finding.links) {
      // The same red flag in several links: mark all of them.
      const links = new Set([...(known.links ?? []), ...finding.links]);
      unique.set(key, { ...known, links: [...links].toSorted((a, b) => a - b) });
    }
  }
  return [...unique.values()]
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
    .slice(0, MAX_FINDINGS);
}
