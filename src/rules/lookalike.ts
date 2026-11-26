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
import { domainsInText, forwardOf, type Host, hostOf, hostOfAddress, parseUrl } from './domains';
import { MAILING_SERVICES } from './services';
import { clip, type Finding, type Severity } from './types';

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
  /** From the brand list (real brands) rather than from the email itself. */
  isBrand: boolean;
}

const brandReferences: Reference[] = BRANDS.flatMap((brand) => {
  const host = hostOf(brand.domains[0]);
  return host.domain && host.label
    ? [{ host: { ...host, domain: host.domain, label: host.label }, isBrand: true }]
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
      ? [{ host: { ...host, domain: host.domain, label: host.label }, isBrand: false }]
      : [],
  );
  const unique = new Map<string, Reference>();
  for (const reference of [...brandReferences, ...fromEmail]) {
    if (!unique.has(reference.host.domain)) unique.set(reference.host.domain, reference);
  }
  return [...unique.values()];
}

interface Candidate {
  host: Host;
  /** Positions of the links that go to this host (directly or by forwarding). */
  links: number[];
}

function candidatesOf(email: Email, sender: Host | undefined): Candidate[] {
  const candidates = new Map<string, Candidate>();
  if (sender) candidates.set(sender.hostname, { host: sender, links: [] });
  email.links.forEach((link, index) => {
    const url = parseUrl(link.href);
    if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return;
    // The link's own host and, for forwarding links, the final target.
    for (const target of [url, forwardOf(url)]) {
      const host = target && hostOf(target.hostname);
      if (!host?.domain) continue;
      const candidate = candidates.get(host.hostname) ?? { host, links: [] };
      if (candidate.links.at(-1) !== index) candidate.links.push(index);
      candidates.set(host.hostname, candidate);
    }
  });
  return [...candidates.values()];
}

/** The first way `candidate` imitates `reference`, as a finding. */
function compare(candidate: Host, reference: Reference): Finding | undefined {
  const { domain, label } = reference.host;
  if (!candidate.domain || !candidate.label || candidate.domain === domain) return undefined;
  if (BRAND_DOMAINS.has(candidate.domain)) return undefined;
  // "shop.us14.list-manage.com" for a newsletter from shop.example: normal click tracking.
  if (!reference.isBrand && MAILING_SERVICES.has(candidate.domain)) return undefined;
  const name = skeleton(label);
  // The host, then the domain it imitates (the panel shows them side by side).
  const evidence = [clip(candidate.hostname), domain];

  const subdomainMinimum = reference.isBrand ? MIN_BRAND_SUBDOMAIN_LENGTH : MIN_NAME_LENGTH;
  if (label.length >= subdomainMinimum && `.${candidate.subdomain}.`.includes(`.${label}.`)) {
    return {
      rule: 'brand-in-subdomain',
      // Mailing services build click-tracking hosts like "shop.mailer.example" for their
      // customers, so a name from the email itself is only a warning.
      severity: reference.isBrand ? 'danger' : 'warning',
      message: `${clip(candidate.hostname)} puts "${label}" in front of a different domain (${candidate.domain}).`,
      evidence,
    };
  }
  if (candidate.label === label) {
    // Same name, other ending: "paypal.support", "paypal.com.co". Companies also use several
    // country domains, so this counts only for listed brands, and only as a warning.
    return reference.isBrand
      ? {
          rule: 'brand-in-domain',
          severity: 'warning',
          message: `${candidate.domain} uses the name "${label}" with a different ending; the real domain is ${domain}.`,
          evidence,
        }
      : undefined;
  }
  if (label.length < MIN_NAME_LENGTH) return undefined;

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

const STRENGTH: Record<Severity, number> = { danger: 2, warning: 1, info: 0 };

export function checkLookalikes(email: Email): Finding[] {
  const sender = hostOfAddress(email.sender.address);
  const references = referencesOf(email, sender);
  const findings = new Map<string, Finding>();
  /** Per candidate domain: the links of every host that imitates a reference. */
  const links = new Map<string, Set<number>>();
  for (const { host, links: hostLinks } of candidatesOf(email, sender)) {
    for (const reference of references) {
      const finding = compare(host, reference);
      if (!finding) continue;
      // One finding per candidate domain: the strongest one.
      const key = host.domain ?? host.hostname;
      const known = findings.get(key);
      if (!known || STRENGTH[finding.severity] > STRENGTH[known.severity]) {
        findings.set(key, finding);
      }
      const keyLinks = links.get(key) ?? new Set<number>();
      for (const index of hostLinks) keyLinks.add(index);
      links.set(key, keyLinks);
    }
  }
  return [...findings].map(([key, finding]) => {
    const marked = [...(links.get(key) ?? [])].toSorted((a, b) => a - b);
    return marked.length > 0 ? { ...finding, links: marked } : finding;
  });
}
