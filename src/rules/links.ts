/*
 * Link rules: what a link really does, compared with what its text promises.
 */
import type { EmailLink } from '../email';
import { domainsInText, forwardTarget, hostOf, isInternational, parseUrl } from './domains';
import { isRedirect } from './services';
import { clip, type Finding } from './types';

/** Schemes that run code or open local files instead of a web page. */
const DANGEROUS_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:']);

function checkLink(link: EmailLink): Finding[] {
  const url = parseUrl(link.href);
  if (!url) return [];
  const href = clip(link.href.trim());

  if (DANGEROUS_SCHEMES.has(url.protocol)) {
    return [
      {
        rule: 'dangerous-link',
        severity: 'danger',
        message: `A link runs code or opens a file instead of a web page (${url.protocol}).`,
        evidence: [href],
      },
    ];
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return [];

  const findings: Finding[] = [];
  const host = hostOf(url.hostname);
  // A link that forwards elsewhere through a parameter: its final target counts too.
  const forward = forwardTarget(url);
  const final = forward && hostOf(forward.hostname);

  if (url.username || url.password) {
    findings.push({
      rule: 'hidden-link-target',
      severity: 'danger',
      // The text before the "@" stays in the evidence only: it is attacker text.
      message: `A link hides its real target behind an "@": it goes to ${url.hostname}.`,
      evidence: [href],
    });
  }
  for (const target of final && final.hostname !== host.hostname ? [host, final] : [host]) {
    if (target.isIp) {
      findings.push({
        rule: 'ip-link',
        severity: 'warning',
        message: `A link goes to a bare IP address (${target.hostname}) instead of a domain name.`,
        evidence: [href],
      });
    }
    if (isInternational(target.hostname)) {
      findings.push({
        rule: 'international-domain',
        severity: 'warning',
        message: `A link uses international letters in its domain (${target.hostname}); they can imitate a familiar name.`,
        evidence: [href],
      });
    }
  }

  // Only link texts that name a domain promise a target ("paypal.com", not "Click here").
  const promised = domainsInText(link.text)[0];
  if (!promised?.domain || !host.domain) return findings;

  // For a forwarding link, compare the text with the final target.
  if (final?.domain && final.domain !== host.domain) {
    if (final.domain !== promised.domain) {
      findings.push({
        rule: 'link-text-mismatch',
        severity: 'warning',
        message: `The link text says ${promised.hostname}, but the link forwards to ${final.hostname} (through ${url.hostname}).`,
        evidence: [clip(link.text), href],
      });
    }
    return findings;
  }

  if (promised.domain !== host.domain) {
    findings.push(
      isRedirect(url.hostname)
        ? {
            rule: 'redirect-link',
            severity: 'info',
            message: `The link text says ${promised.hostname}, but the link goes through a redirect service (${url.hostname}), so its final target is unknown.`,
            evidence: [clip(link.text), href],
          }
        : {
            rule: 'link-text-mismatch',
            severity: 'warning',
            message: `The link text says ${promised.hostname}, but the link goes to ${url.hostname}.`,
            evidence: [clip(link.text), href],
          },
    );
  }
  return findings;
}

export function checkLinks(links: readonly EmailLink[]): Finding[] {
  return links.flatMap(checkLink);
}
