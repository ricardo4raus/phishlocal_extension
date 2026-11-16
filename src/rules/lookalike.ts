/*
 * Lookalike rules: domains that imitate another domain ("paypa1.com"), contain its name
 * ("lumora-bank-verify.example" for "lumorabank.example") or put it in front of a different
 * domain ("paypal.com.secure-login.example").
 *
 * Reference domains come from the email itself (sender, link texts, body) and from a short list
 * of often-imitated brands. Candidates are the sender's domain and every link target.
 */
import type { Email } from '../email';
import { BRAND_DOMAINS, BRANDS } from './brands';
import { domainsInText, type Host, hostOf, hostOfAddress, parseUrl } from './domains';
import { clip, type Finding } from './types';

/** Shorter names match too much by chance ("post", "mail"). */
const MIN_NAME_LENGTH = 5;
/** Below this length, only character tricks count, not typos ("apple" vs "apply"). */
const MIN_TYPO_LENGTH = 6;
/** Short brand names (DHL, UPS) are only checked in front of another domain. */
const MIN_BRAND_SUBDOMAIN_LENGTH = 3;

/**
 * Maps characters that look alike to one form, so `paypa1`, `paypai` and `paypal` become equal.
 * Hostnames from `URL` are lowercase ASCII (international names are `xn--…`).
 */
export function skeleton(label: string): string {
  return label
    .toLowerCase()
    .replaceAll('rn', 'm')
    .replaceAll('vv', 'w')
    .replaceAll(/[il1]/g, 'l')
    .replaceAll('0', 'o')
    .replaceAll('3', 'e')
    .replaceAll('5', 's');
}

/** True if `a` and `b` differ by at most one inserted, removed, changed or swapped character. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    return (
      a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
    );
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

interface Reference {
  host: Host & { domain: string; label: string };
  /** Shortest name length this reference may be matched with. */
  minLength: number;
}

const brandReferences: Reference[] = BRANDS.flatMap((brand) => {
  const host = hostOf(brand.domains[0]);
  return host.domain && host.label
    ? [{ host: { ...host, domain: host.domain, label: host.label }, minLength: 0 }]
    : [];
});

function referencesOf(email: Email, sender: Host | undefined): Reference[] {
  const fromEmail = [
    ...(sender ? [sender] : []),
    ...domainsInText(email.sender.name),
    ...domainsInText(email.subject),
    ...email.links.flatMap((link) => domainsInText(link.text).slice(0, 1)),
    ...domainsInText(email.bodyText),
  ].flatMap((host): Reference[] =>
    host.domain && host.label
      ? [{ host: { ...host, domain: host.domain, label: host.label }, minLength: MIN_NAME_LENGTH }]
      : [],
  );
  const unique = new Map<string, Reference>();
  for (const reference of [...brandReferences, ...fromEmail]) {
    if (!unique.has(reference.host.domain)) unique.set(reference.host.domain, reference);
  }
  return [...unique.values()];
}

function candidatesOf(email: Email, sender: Host | undefined): Host[] {
  const hosts = new Map<string, Host>();
  if (sender) hosts.set(sender.hostname, sender);
  for (const link of email.links) {
    const url = parseUrl(link.href);
    if (url && (url.protocol === 'https:' || url.protocol === 'http:')) {
      const host = hostOf(url.hostname);
      if (host.domain && !hosts.has(host.hostname)) hosts.set(host.hostname, host);
    }
  }
  return [...hosts.values()];
}

/** The first way `candidate` imitates `reference`, as a finding. */
function compare(candidate: Host, reference: Reference): Finding | undefined {
  const { domain, label } = reference.host;
  if (!candidate.domain || !candidate.label || candidate.label === label) return undefined;
  if (BRAND_DOMAINS.has(candidate.domain)) return undefined;
  const name = skeleton(label);
  const evidence = [clip(candidate.hostname)];

  const subdomainMinimum = Math.max(reference.minLength, MIN_BRAND_SUBDOMAIN_LENGTH);
  if (label.length >= subdomainMinimum && `.${candidate.subdomain}.`.includes(`.${label}.`)) {
    return {
      rule: 'brand-in-subdomain',
      severity: 'danger',
      message: `${clip(candidate.hostname)} puts "${label}" in front of a different domain (${candidate.domain}).`,
      evidence,
    };
  }
  if (label.length < Math.max(reference.minLength, MIN_NAME_LENGTH)) return undefined;

  const own = skeleton(candidate.label);
  if (own === name || (label.length >= MIN_TYPO_LENGTH && withinOneEdit(own, name))) {
    return {
      rule: 'lookalike-domain',
      severity: 'danger',
      message: `${candidate.domain} looks like ${domain}, but it is a different domain.`,
      evidence,
    };
  }
  if (own.replaceAll('-', '').includes(name.replaceAll('-', ''))) {
    return {
      rule: 'brand-in-domain',
      severity: 'warning',
      message: `${candidate.domain} contains the name "${label}", but it is not ${domain}.`,
      evidence,
    };
  }
  return undefined;
}

const RANK = { 'brand-in-subdomain': 0, 'lookalike-domain': 1, 'brand-in-domain': 2 } as const;
const rank = (finding: Finding): number => RANK[finding.rule as keyof typeof RANK] ?? 3;

export function checkLookalikes(email: Email): Finding[] {
  const sender = hostOfAddress(email.sender.address);
  const references = referencesOf(email, sender);
  const findings = new Map<string, Finding>();
  for (const candidate of candidatesOf(email, sender)) {
    for (const reference of references) {
      const finding = compare(candidate, reference);
      if (!finding) continue;
      // One finding per candidate domain: the strongest one.
      const key = candidate.domain ?? candidate.hostname;
      const known = findings.get(key);
      if (!known || rank(finding) < rank(known)) findings.set(key, finding);
    }
  }
  return [...findings.values()];
}
