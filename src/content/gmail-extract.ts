import {
  cut,
  cutLink,
  cutMailbox,
  type Email,
  type EmailLink,
  FIELD_LIMITS,
  MAX_BODY_CHARS,
  MAX_LINKS,
} from '../email';

/**
 * Gmail DOM selectors, measured on 15 Nov 2026 (Chrome 157, Gmail in German). Gmail's class names
 * are generated and can change, so every selector lives here, each with fallbacks in order.
 */
export const SELECTORS = {
  /** Thread subject. */
  subject: ['h2.hP', 'h2[data-thread-perm-id]'],
  /** One message in the open thread. */
  message: ['div.adn[data-message-id]', '[data-message-id]', '[data-legacy-message-id]'],
  /** Body of a message; only present while the message is expanded. */
  body: ['div.a3s'],
  /** Sender of a message (recipients carry `email` too, with class `g2`). */
  sender: ['span.gD[email]', 'span[email]:not(.g2)'],
} as const;

const firstMatch = (root: ParentNode, selectors: readonly string[]): Element | null => {
  for (const selector of selectors) {
    const element = root.querySelector(selector);
    if (element) return element;
  }
  return null;
};

const allMatches = (root: ParentNode, selectors: readonly string[]): Element[] => {
  for (const selector of selectors) {
    const elements = [...root.querySelectorAll(selector)];
    if (elements.length > 0) return elements;
  }
  return [];
};

const squeeze = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Visible text (`innerText` skips hidden elements, like a reader does). */
const visibleText = (element: Element): string =>
  element instanceof HTMLElement ? element.innerText : (element.textContent ?? '');

function linksOf(body: Element): EmailLink[] {
  return [...body.querySelectorAll<HTMLAnchorElement>('a[href]')]
    .slice(0, MAX_LINKS)
    .map((anchor) => {
      const images = [...anchor.querySelectorAll('img[alt]')].map((img) => img.getAttribute('alt'));
      const text = squeeze(visibleText(anchor)) || squeeze(images.join(' '));
      return cutLink({ text, href: anchor.href });
    });
}

/**
 * The email open in Gmail: the last message of the thread whose body is expanded.
 * `undefined` if no email is open (e.g. the inbox list is shown).
 */
export function extractEmail(document: Document): Email | undefined {
  const message = allMatches(document, SELECTORS.message)
    .filter((candidate) => firstMatch(candidate, SELECTORS.body) !== null)
    .at(-1);
  if (!message) return undefined;

  const body = firstMatch(message, SELECTORS.body) as Element;
  const sender = firstMatch(message, SELECTORS.sender);
  const subject = firstMatch(document, SELECTORS.subject);
  const text = visibleText(body).trim();

  return {
    sender: cutMailbox({
      name: squeeze(sender?.getAttribute('name') ?? sender?.textContent ?? ''),
      address: (sender?.getAttribute('email') ?? '').trim(),
    }),
    subject: cut(squeeze(subject?.textContent ?? ''), FIELD_LIMITS.subject),
    bodyText: text.slice(0, MAX_BODY_CHARS),
    links: linksOf(body),
    truncated: text.length > MAX_BODY_CHARS,
  };
}
