/*
 * Header rules, only for emails read from their raw source: where replies go, and what the
 * receiving server's sender checks (SPF, DKIM, DMARC) said.
 *
 * Only the topmost Authentication-Results header is used (see parseRawEmail). Messages contain
 * only domains and fixed words, never free text from the headers.
 */
import type { Email } from '../email';
import { companyRelation } from './company';
import { hostOf, hostOfAddress } from './domains';
import { clip, type Finding } from './types';

const FAILED = new Set(['fail', 'softfail', 'permerror']);

export function checkHeaders(email: Email): Finding[] {
  const { headers } = email;
  if (!headers) return [];
  const findings: Finding[] = [];
  const from = hostOfAddress(email.sender.address);

  // Replies to another company: the classic way to collect answers to a fake invoice.
  for (const reply of headers.replyTo) {
    const host = hostOfAddress(reply.address);
    if (!host?.domain || !from?.domain) continue;
    const relation = companyRelation(host, from);
    if (relation === 'same') continue;
    findings.push({
      rule: 'reply-to-mismatch',
      severity: relation === 'other' ? 'warning' : 'info',
      message:
        relation === 'other'
          ? `Replies go to ${host.domain}, not to the sender's domain ${from.domain}.`
          : `Replies go to ${host.domain}, the sender is ${from.domain} (same name, other ending).`,
      evidence: [clip(reply.address)],
    });
  }

  const { auth } = headers;
  if (!auth) {
    findings.push({
      rule: 'no-auth-results',
      severity: 'info',
      message:
        'The headers contain no sender checks (SPF, DKIM, DMARC), so the sender cannot be verified.',
      evidence: [],
    });
    return findings;
  }

  const by = `checked by ${auth.server}`;
  const spfPass = auth.spf === 'pass';
  const dkimPass = auth.dkim.some((dkim) => dkim.result === 'pass');
  const failed =
    (auth.spf !== undefined && FAILED.has(auth.spf)) ||
    auth.dkim.some((dkim) => FAILED.has(dkim.result));

  if (auth.dmarc === 'fail') {
    findings.push({
      rule: 'dmarc-fail',
      severity: 'danger',
      message: `The sender's domain${from?.domain ? ` ${from.domain}` : ''} does not confirm this email: DMARC failed (${by}).`,
      evidence: [auth.server],
    });
  } else if (failed && !spfPass && !dkimPass) {
    findings.push({
      rule: 'auth-fail',
      severity: 'warning',
      message: `The sender checks failed: SPF ${auth.spf ?? 'none'}, DKIM ${auth.dkim[0]?.result ?? 'none'} (${by}).`,
      evidence: [auth.server],
    });
  }

  // Signed only by another domain: normal for mailing services, worth a note without DMARC.
  const signers = auth.dkim.flatMap((dkim) =>
    dkim.result === 'pass' && dkim.domain ? [hostOf(dkim.domain)] : [],
  );
  if (
    auth.dmarc !== 'pass' &&
    auth.dmarc !== 'fail' &&
    from?.domain &&
    signers.length > 0 &&
    !signers.some((signer) => signer.domain === from.domain)
  ) {
    findings.push({
      rule: 'dkim-other-domain',
      severity: 'info',
      message: `The email is signed by ${signers[0]?.domain ?? signers[0]?.hostname}, not by the sender's domain ${from.domain}.`,
      evidence: [auth.server],
    });
  }
  return findings;
}
