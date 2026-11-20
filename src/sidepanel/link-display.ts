/*
 * How a link is shown in the side panel: where it really goes, in a form that is quick to read.
 * Pure functions: no DOM, no network.
 */
import { forwardTarget, hostOf, hostOfAddress, parseUrl } from '../rules/domains';

export interface LinkDisplay {
  /**
   * What to read first: the registrable domain (`paypa1-secure.example`), else the IP address or
   * hostname, else the scheme (`javascript:`). Empty if the link is not a valid web address.
   */
  domain: string;
  /** For a link that forwards through a parameter: the final target's domain. */
  forwardsTo?: string;
  /** The URL shortened for reading; the host is never cut, only the rest. */
  short: string;
}

/** Longest path (with query and fragment) shown before it is cut in the middle. */
export const MAX_PATH_CHARS = 40;
/** Longest non-web link (e.g. `javascript:…`) shown before it is cut. */
export const MAX_OTHER_CHARS = 60;

/** Cuts the middle out of a long text, so its start and end stay readable. */
export function cutMiddle(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = Math.ceil((max - 1) * 0.6);
  const tail = max - 1 - head;
  return `${chars.slice(0, head).join('')}…${tail > 0 ? chars.slice(-tail).join('') : ''}`;
}

const domainOf = (hostname: string): string => hostOf(hostname).domain ?? hostname;

export function linkDisplay(href: string): LinkDisplay {
  const url = parseUrl(href);
  if (!url) return { domain: '', short: cutMiddle(href.trim(), MAX_OTHER_CHARS) };

  if (url.protocol === 'mailto:') {
    const address = decodeAddress(url.pathname);
    return {
      domain: hostOfAddress(address)?.domain ?? 'mailto:',
      short: cutMiddle(`mailto:${address}`, MAX_OTHER_CHARS),
    };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { domain: url.protocol, short: cutMiddle(href.trim(), MAX_OTHER_CHARS) };
  }

  const domain = domainOf(url.hostname);
  const target = forwardTarget(url);
  const forwardsTo = target && domainOf(target.hostname);
  // The part before an "@" (user name, password) is left out: it is the attacker's decoy.
  const rest = `${url.pathname}${url.search}${url.hash}`;
  const scheme = url.protocol === 'https:' ? '' : 'http://';
  const port = url.port ? `:${url.port}` : '';
  return {
    domain,
    ...(forwardsTo && forwardsTo !== domain ? { forwardsTo } : {}),
    short: `${scheme}${url.hostname}${port}${rest === '/' ? '' : cutMiddle(rest, MAX_PATH_CHARS)}`,
  };
}

/** The address of a `mailto:` link, without its `?subject=…` part. */
function decodeAddress(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
