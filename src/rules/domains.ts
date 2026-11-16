/*
 * Domain helpers for the rule checks. Pure functions: no DOM, no network.
 *
 * The rules compare registrable domains: the part a person can register, e.g. `google.com` for
 * `accounts.google.com`. Finding it needs the Public Suffix List, which tldts bundles. Without it,
 * `bank.github.io` and `evil.github.io` would look like the same site, and attackers host
 * phishing pages on exactly such shared hosts.
 */
import { parse } from 'tldts';
import { normalizeText } from './words';

export interface Host {
  /** Lowercase hostname; international names in punycode (`xn--…`), as `URL` returns them. */
  hostname: string;
  /** Registrable domain, e.g. `google.com`. Undefined for IP addresses and unknown suffixes. */
  domain?: string;
  /** The registrable domain without its suffix, e.g. `google`. */
  label?: string;
  /** Labels in front of the registrable domain, e.g. `accounts` (empty if none). */
  subdomain: string;
  isIp: boolean;
}

/**
 * `allowPrivateDomains`: suffixes such as `github.io` count as public, so `bank.github.io` is its
 * own domain. `detectSpecialUse`: reserved names such as `.example` (used by our samples) are
 * accepted as a suffix instead of being rejected.
 */
const PARSE_OPTIONS = { allowPrivateDomains: true, detectSpecialUse: true } as const;

/** Parses a hostname (as returned by `URL`). */
export function hostOf(hostname: string): Host {
  const result = parse(hostname, PARSE_OPTIONS);
  const known =
    result.isIcann === true || result.isPrivate === true || result.isSpecialUse === true;
  const isIp = result.isIp === true;
  const usable = known && !isIp;
  return {
    hostname,
    domain: (usable && result.domain) || undefined,
    label: (usable && result.domainWithoutSuffix) || undefined,
    subdomain: result.subdomain ?? '',
    isIp,
  };
}

/** The URL of a link, or undefined if the browser could not open it either. */
export function parseUrl(href: string): URL | undefined {
  try {
    return new URL(href.trim());
  } catch {
    return undefined;
  }
}

/** The host of an email address (`a@bank.example`), if it has a registrable domain. */
export function hostOfAddress(address: string): Host | undefined {
  const at = address.lastIndexOf('@');
  if (at < 0) return undefined;
  const url = parseUrl(`https://${address.slice(at + 1)}`);
  const host = url && hostOf(url.hostname);
  return host?.domain ? host : undefined;
}

/**
 * Domain-like words such as `paypal.com` or `www.bank.example/login`. The character classes
 * exclude the dot, so the pattern cannot backtrack badly on long input.
 */
const DOMAIN_WORD = /(?<![\p{L}\p{N}.-])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

/** Upper limit for domains taken from one text (the body can be 20,000 characters). */
export const MAX_DOMAINS_IN_TEXT = 100;

/**
 * Domains named in a text (link text, sender name, body), unique, in order of appearance. Only
 * words with a real suffix count, so `Node.js`, `1.99` or `e.g.` are not domains. The text is
 * normalized first, so `ｐａｙｐａｌ．ｃｏｍ` and `paypal。com` count as `paypal.com`.
 */
export function domainsInText(text: string): Host[] {
  const hosts = new Map<string, Host>();
  for (const [word] of normalizeText(text).matchAll(DOMAIN_WORD)) {
    const url = parseUrl(`https://${word}`);
    const host = url && hostOf(url.hostname);
    if (host?.domain && !hosts.has(host.hostname)) {
      hosts.set(host.hostname, host);
      if (hosts.size >= MAX_DOMAINS_IN_TEXT) break;
    }
  }
  return [...hosts.values()];
}
