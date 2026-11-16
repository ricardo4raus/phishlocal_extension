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
 * True if both hosts belong to the same company: same domain, same name with another ending
 * ("PayPal.de" for paypal.com, "Shop.ch" for shop.de) or two domains of one listed brand.
 */
function sameOwner(a: Host, b: Host): boolean {
  if (a.domain === b.domain || (a.label !== undefined && a.label === b.label)) return true;
  return BRANDS.some(
    (brand) =>
      a.domain !== undefined &&
      b.domain !== undefined &&
      brand.domains.includes(a.domain) &&
      brand.domains.includes(b.domain),
  );
}

function checkSenderName(rawName: string, host: Host, evidence: string[]): Finding[] {
  const name = normalizeText(rawName);
  const domain = host.domain ?? host.hostname;
  if (name.trim() === '') return [];

  // "service@paypal.com <x@evil.example>": the name shows another company's address or domain.
  const shown = domainsInText(name).find((named) => !sameOwner(named, host));
  if (shown) {
    return [
      {
        rule: 'sender-name-domain',
        severity: 'danger',
        message: `The sender name shows ${clip(shown.hostname)}, but the email comes from ${domain}.`,
        evidence,
      },
    ];
  }

  // "PayPal <x@evil.example>". Brands also use domains we don't list, so only a warning.
  const brand = brandPatterns.find(({ pattern }) => pattern.test(name))?.brand;
  if (brand && !brand.domains.includes(domain)) {
    return [
      {
        rule: 'sender-name-brand',
        severity: 'warning',
        message: `The sender name says ${brand.name}, but ${domain} is not one of ${brand.name}'s known domains.`,
        evidence,
      },
    ];
  }
  return [];
}
