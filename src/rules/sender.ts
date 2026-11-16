/*
 * Sender rules: does the sender name promise someone the address does not belong to?
 *
 * Every path has the sender name and address; Reply-To and the sender checks need the raw email
 * and live in `headers.ts`.
 */
import type { Email } from '../email';
import { BRANDS } from './brands';
import { companyRelation } from './company';
import { domainsInText, type Host, hostOfAddress, isInternational } from './domains';
import { clip, type Finding } from './types';
import { normalizeText, wordsPattern } from './words';

const brandPatterns = BRANDS.map((brand) => ({ brand, pattern: wordsPattern([brand.name], 'iu') }));

export function checkSender(sender: Email['sender']): Finding[] {
  const host = hostOfAddress(sender.address);
  if (!host?.domain) return [];
  const evidence = [clip(sender.name), clip(sender.address)];
  const findings: Finding[] = [];

  // "paypal.com" written with a Cyrillic "a" arrives as "xn--…"; the reader sees a familiar name.
  if (isInternational(host.hostname)) {
    findings.push({
      rule: 'international-domain',
      severity: 'warning',
      message: `The sender's domain uses international letters (${host.hostname}); they can imitate a familiar name.`,
      evidence,
    });
  }
  return [...findings, ...checkSenderName(sender.name, host, evidence)];
}

function checkSenderName(rawName: string, host: Host, evidence: string[]): Finding[] {
  const name = normalizeText(rawName);
  const domain = host.domain ?? host.hostname;
  if (name.trim() === '') return [];
  const findings: Finding[] = [];

  // "service@paypal.com <x@evil.example>": the name shows another company's address or domain.
  const shown = domainsInText(name).map((named) => ({
    named,
    relation: companyRelation(named, host),
  }));
  const other = shown.find((entry) => entry.relation === 'other')?.named;
  if (other) {
    return [
      {
        rule: 'sender-name-domain',
        severity: 'danger',
        message: `The sender name shows ${clip(other.hostname)}, but the email comes from ${domain}.`,
        evidence,
      },
    ];
  }
  const sameName = shown.find((entry) => entry.relation === 'same-name')?.named;
  if (sameName) {
    findings.push({
      rule: 'sender-name-domain',
      severity: 'info',
      message: `The sender name shows ${clip(sameName.hostname)}, but the email comes from ${domain} (same name, other ending).`,
      evidence,
    });
  }

  // "PayPal <x@evil.example>". Brands also use domains we don't list, so only a warning.
  const brand = brandPatterns.find(({ pattern }) => pattern.test(name))?.brand;
  if (brand && !brand.domains.includes(domain)) {
    findings.push({
      rule: 'sender-name-brand',
      severity: 'warning',
      message: `The sender name says ${brand.name}, but ${domain} is not one of ${brand.name}'s known domains.`,
      evidence,
    });
  }
  return findings;
}
