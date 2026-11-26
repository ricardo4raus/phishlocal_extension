/*
 * Link rules: what a link really does, compared with what its text promises.
 */
import type { Email, EmailLink } from '../email';
import { companyRelation } from './company';
import {
  domainsInText,
  forwardTarget,
  type Host,
  hostOf,
  hostOfAddress,
  isInternational,
  parseUrl,
  pathTarget,
} from './domains';
import {
  FREE_MAIL_DOMAINS,
  forwardsByPath,
  isCommonLinkDomain,
  isRedirect,
  SENDING_PLATFORMS,
} from './services';
import { clip, type Finding } from './types';

/** Who sent the email, for the link rules: its domain, and whether DMARC confirmed it. */
export interface LinkSender {
  host?: Host;
  confirmed: boolean;
}

/** The sender of an email for the link rules. */
export const linkSender = (email: Email): LinkSender => ({
  host: hostOfAddress(email.sender.address),
  confirmed: email.headers?.auth?.dmarc === 'pass',
});

/**
 * Where a link really goes: the target behind a forwarding parameter, or in the path of a
 * click-tracking service that redirects there; else the link's own host.
 */
function finalTarget(url: URL): { host: Host; final?: Host } {
  const host = hostOf(url.hostname);
  const forward = forwardTarget(url) ?? (forwardsByPath(host.domain) ? pathTarget(url) : undefined);
  return { host, final: forward && hostOf(forward.hostname) };
}

/**
 * The text names the confirmed sender's own domain, and the link goes to the same name with
 * another ending (dpd.ch says www.dpd.ch, links to www.dpd.com): a company's own sites. Only the
 * real sender can name its own domain in a confirmed email, so a fake cannot use this (except
 * from a free email provider, where anyone is a confirmed sender).
 */
const ownSites = (promised: Host, target: Host, sender: LinkSender): boolean =>
  sender.confirmed &&
  sender.host !== undefined &&
  // A free email provider confirms only itself, not who wrote the email.
  !FREE_MAIL_DOMAINS.has(sender.host.domain ?? '') &&
  companyRelation(promised, sender.host) === 'same' &&
  companyRelation(target, sender.host) !== 'other';

const ownSitesNote = (promised: Host, target: Host, link: EmailLink, href: string): Finding => ({
  rule: 'link-text-mismatch',
  severity: 'info',
  message: `The link text says ${promised.hostname}, the link goes to ${target.hostname}: the same name with another ending, from the confirmed sender.`,
  evidence: [clip(link.text), href],
});

/** Schemes that run code or open local files instead of a web page. */
const DANGEROUS_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:']);

function checkLink(link: EmailLink, sender: LinkSender): Finding[] {
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
  // A link that forwards elsewhere (a parameter, a tracker's path): its final target counts too.
  const { host, final } = finalTarget(url);

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
    // Only a real domain: a broken link such as `https://”` turns into `xn--ivg`, which no
    // browser can open and no reader takes for a familiar name.
    if (target.domain && isInternational(target.hostname)) {
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
      findings.push(
        ownSites(promised, final, sender)
          ? ownSitesNote(promised, final, link, href)
          : {
              rule: 'link-text-mismatch',
              severity: 'warning',
              message: `The link text says ${promised.hostname}, but the link forwards to ${final.hostname} (through ${url.hostname}).`,
              evidence: [clip(link.text), href],
            },
      );
    }
    return findings;
  }

  if (promised.domain !== host.domain) {
    findings.push(
      ownSites(promised, host, sender)
        ? ownSitesNote(promised, host, link, href)
        : isRedirect(url.hostname)
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

export function checkLinks(
  links: readonly EmailLink[],
  sender: LinkSender = { confirmed: false },
): Finding[] {
  return links.flatMap((link, index) =>
    checkLink(link, sender).map((finding) => ({ ...finding, links: [index] })),
  );
}

/** Upper limit for links looked at by `linksLeaveSender`. */
const MAX_LINKS_CHECKED = 200;

/** Shortest company name that counts inside another domain (`dpd` in `dpdgroup.com`). */
const MIN_NAME_LENGTH = 3;

/**
 * The domain belongs to the sender's company: the same domain, the same name with another
 * ending, or a domain that contains the sender's name (dpd.ch and dpdgroup.com, dhl.com and
 * logistics.dhl). An attacker gains nothing from this: a link to its own domain stays too. A
 * free email provider is no company: only its own domain counts (else `gmail-verify.example`
 * would belong to a gmail.com sender).
 */
function ownCompany(target: Host, sender: Host): boolean {
  if (FREE_MAIL_DOMAINS.has(sender.domain ?? '')) return target.domain === sender.domain;
  if (companyRelation(target, sender) !== 'other') return true;
  const name = sender.label ?? '';
  return name.length >= MIN_NAME_LENGTH && (target.domain ?? '').includes(name);
}

/**
 * True if a web link takes the reader away from the sender: its final target is neither the
 * sender's company nor a site that real emails of any sender link to (social networks, app
 * stores, mailing services' click tracking). Phishing from an attacker's own, confirmed domain
 * mostly links to a shortener, a free hosting site or a hijacked, unrelated site. Hosts without
 * a domain (broken links; an IP address has its own rule) do not count. A confirmed platform that
 * sends for shops (Stripe, Shopify) links to the shop's own site: its links do not count either.
 */
export function linksLeaveSender(email: Email): boolean {
  const sender = hostOfAddress(email.sender.address);
  if (!sender) return email.links.length > 0;
  if (email.headers?.auth?.dmarc === 'pass' && SENDING_PLATFORMS.has(sender.domain ?? '')) {
    return false;
  }
  return email.links.slice(0, MAX_LINKS_CHECKED).some((link) => {
    const url = parseUrl(link.href);
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return false;
    // Every hop must stay: the link's own host and the target it forwards to. Else any site
    // could add `?ref=https://<sender's domain>` and count as the sender's own.
    const { host, final } = finalTarget(url);
    return [host, ...(final ? [final] : [])].some(
      (hop) =>
        hop.domain !== undefined && !ownCompany(hop, sender) && !isCommonLinkDomain(hop.domain),
    );
  });
}
