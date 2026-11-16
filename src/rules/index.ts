/*
 * Rule checks: plain TypeScript, no AI, no network. They run on the device in milliseconds, and
 * their findings will be fed into the AI prompt.
 */
import type { Email } from '../email';
import { checkLinks } from './links';
import { checkLookalikes } from './lookalike';
import { checkPhrases } from './phrases';
import { checkSender } from './sender';
import type { Finding, Severity } from './types';

export type { Finding, Severity } from './types';

/** Upper limit for findings per email, so a hostile email cannot flood the panel or prompt. */
export const MAX_FINDINGS = 30;

const ORDER: Record<Severity, number> = { danger: 0, warning: 1, info: 2 };

/** All findings for an email: the most severe first, each one once. */
export function checkEmail(email: Email): Finding[] {
  const findings = [
    ...checkSender(email.sender),
    ...checkLookalikes(email),
    ...checkLinks(email.links),
    ...checkPhrases(email),
  ];
  const unique = new Map<string, Finding>();
  for (const finding of findings) {
    const key = `${finding.rule}\n${finding.message}`;
    if (!unique.has(key)) unique.set(key, finding);
  }
  return [...unique.values()]
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
    .slice(0, MAX_FINDINGS);
}
