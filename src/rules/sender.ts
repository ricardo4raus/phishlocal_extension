/*
 * Sender rules: does the sender name promise someone the address does not belong to?
 *
 * This replaces a Reply-To check: Gmail's page does not show Reply-To (only its details box
 * does), so the rules use what every path has, the sender name and address.
 */
import type { Email } from '../email';
import { BRANDS } from './brands';
import { domainsInText, hostOfAddress } from './domains';
import { clip, type Finding } from './types';
import { normalizeText, wordsPattern } from './words';

const brandPatterns = BRANDS.map((brand) => ({ brand, pattern: wordsPattern([brand.name], 'iu') }));

export function checkSender(sender: Email['sender']): Finding[] {
  const host = hostOfAddress(sender.address);
  const name = normalizeText(sender.name);
  if (!host?.domain || name.trim() === '') return [];
  const evidence = [clip(sender.name), clip(sender.address)];

  // "service@paypal.com <x@evil.example>": the name shows an address or domain of its own.
  const shown = domainsInText(name).find((named) => named.domain !== host.domain);
  if (shown) {
    return [
      {
        rule: 'sender-name-domain',
        severity: 'danger',
        message: `The sender name shows ${clip(shown.hostname)}, but the email comes from ${host.domain}.`,
        evidence,
      },
    ];
  }

  // "PayPal <x@evil.example>". Brands also use domains we don't list, so only a warning.
  const brand = brandPatterns.find(({ pattern }) => pattern.test(name))?.brand;
  if (brand && !brand.domains.includes(host.domain)) {
    return [
      {
        rule: 'sender-name-brand',
        severity: 'warning',
        message: `The sender name says ${brand.name}, but ${host.domain} is not one of ${brand.name}'s known domains.`,
        evidence,
      },
    ];
  }
  return [];
}
