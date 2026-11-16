/*
 * Sender rules: does the sender name promise someone the address does not belong to?
 *
 * This replaces a Reply-To check: Gmail's page does not show Reply-To (only its details box
 * does), so the rules use what every path has, the sender name and address.
 */
import type { Email } from '../email';
import { BRANDS } from './brands';
import { domainsInText, type Host, hostOfAddress } from './domains';
import { clip, type Finding } from './types';
import { normalizeText, wordsPattern } from './words';

const brandPatterns = BRANDS.map((brand) => ({ brand, pattern: wordsPattern([brand.name], 'iu') }));

export function checkSender(sender: Email['sender']): Finding[] {
  const host = hostOfAddress(sender.address);
  if (!host?.domain) return [];
  const evidence = [clip(sender.name), clip(sender.address)];
  const findings: Finding[] = [];

  // "paypal.com" written with a Cyrillic "a" arrives as "xn--…"; the reader sees a familiar name.
  if (host.hostname.split('.').some((label) => label.startsWith('xn--'))) {
    findings.push({
      rule: 'international-domain',
      severity: 'warning',
      message: `The sender's domain uses international letters (${host.hostname}); they can imitate a familiar name.`,
      evidence,
    });
  }
  return [...findings, ...checkSenderName(sender.name, host, evidence)];
}

/**
 * How a domain in the sender name relates to the sender's domain: `same` company (same domain,
 * or two domains of one listed brand such as "PayPal.de" for paypal.com), the `same-name` with
 * another ending ("Shop.ch" for shop.de: often the same company, sometimes a fake), or `other`.
 */
function relation(shown: Host, sender: Host): 'same' | 'same-name' | 'other' {
  const a = shown.domain;
  const b = sender.domain;
  if (a === b) return 'same';
  if (a && b && BRANDS.some((brand) => brand.domains.includes(a) && brand.domains.includes(b))) {
    return 'same';
  }
  return shown.label !== undefined && shown.label === sender.label ? 'same-name' : 'other';
}

function checkSenderName(rawName: string, host: Host, evidence: string[]): Finding[] {
  const name = normalizeText(rawName);
  const domain = host.domain ?? host.hostname;
  if (name.trim() === '') return [];
  const findings: Finding[] = [];

  // "service@paypal.com <x@evil.example>": the name shows another company's address or domain.
  const shown = domainsInText(name).map((named) => ({ named, relation: relation(named, host) }));
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
