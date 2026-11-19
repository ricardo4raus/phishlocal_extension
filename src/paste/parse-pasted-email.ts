/*
 * Turns a pasted email into the same `Email` the Gmail content script produces.
 *
 * Copying an email puts two versions on the clipboard: `text/plain` (what the reader sees, so
 * hidden text is already gone) and `text/html` (which still has the real link targets). The body
 * text comes from `text/plain`; links come from `text/html`, plus URLs typed in the text.
 *
 * The HTML is attacker-controlled. It is read with parse5, a pure parser: no DOM, no network, no
 * scripts. DOMParser is not used because its documents can still load `<img>` and `<iframe>`
 * resources, which would let a tracking pixel in the email report back.
 */
import {
  type DefaultTreeAdapterMap,
  type DefaultTreeAdapterTypes,
  defaultTreeAdapter,
  parse,
  type TreeAdapter,
} from 'parse5';
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

/** Only the first 2 MB of HTML are read, so a huge email cannot hang the panel. */
export const MAX_PASTE_HTML_CHARS = 2_000_000;

/**
 * Deeper HTML is not read further. parse5 slows down with the square of the nesting depth
 * (40,000 nested `<div>` take about 5 s), and real emails stay far below 100 levels.
 */
export const MAX_HTML_DEPTH = 1_000;

export interface PastedEmail {
  /** The `text/plain` version, possibly edited by the user. */
  text: string;
  /** The `text/html` version from the clipboard, if there was one. */
  html?: string;
  /** "Name <address>" or just the address, as typed by the user. */
  sender?: string;
  subject?: string;
}

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlParent = DefaultTreeAdapterTypes.ParentNode;

const squeeze = (text: string): string => text.replace(/\s+/g, ' ').trim();

const isElement = (node: HtmlNode): node is HtmlElement => 'tagName' in node;

const textValue = (node: HtmlNode): string | undefined =>
  'value' in node && node.nodeName === '#text' ? node.value : undefined;

/**
 * Visits a node and everything below it in document order (including `<template>` contents).
 * Without recursion, so deep nesting cannot overflow the call stack. `visit` returns `false` to
 * skip a node's children.
 */
function walk(root: HtmlNode, visit: (node: HtmlNode) => boolean | void): void {
  const stack: HtmlNode[] = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (visit(node) === false) continue;
    if ('content' in node) stack.push(node.content);
    if ('childNodes' in node) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const child = node.childNodes[i];
        if (child) stack.push(child);
      }
    }
  }
}

class TooDeep extends Error {}

/**
 * Parses at most {@link MAX_PASTE_HTML_CHARS} of HTML and stops at {@link MAX_HTML_DEPTH}
 * levels. `complete` is false if anything was left out; what was read so far is kept.
 */
function parseLimited(html: string): { document: HtmlNode; complete: boolean } {
  const tooLarge = html.length > MAX_PASTE_HTML_CHARS;
  const depths = new WeakMap<HtmlNode, number>();
  // A template's content has no parent; its depth continues from the template element.
  const owners = new WeakMap<HtmlNode, HtmlNode>();
  const depthOf = (node: HtmlNode): number => depths.get(node) ?? 0;
  const place = (parent: HtmlParent, child: HtmlNode): void => {
    const owner = owners.get(parent);
    const depth = (owner ? depthOf(owner) + 1 : depthOf(parent)) + 1;
    if (depth > MAX_HTML_DEPTH) throw new TooDeep();
    depths.set(child, depth);
  };

  let document: HtmlNode = defaultTreeAdapter.createDocument();
  const treeAdapter: TreeAdapter<DefaultTreeAdapterMap> = {
    ...defaultTreeAdapter,
    createDocument: () => {
      const created = defaultTreeAdapter.createDocument();
      document = created;
      return created;
    },
    appendChild: (parent, child) => {
      place(parent, child);
      defaultTreeAdapter.appendChild(parent, child);
    },
    insertBefore: (parent, child, reference) => {
      place(parent, child);
      defaultTreeAdapter.insertBefore(parent, child, reference);
    },
    setTemplateContent: (template, content) => {
      owners.set(content, template);
      defaultTreeAdapter.setTemplateContent(template, content);
    },
  };
  try {
    // Lone surrogates become U+FFFD first: parse5 8.0.1 throws "Invalid code point" on two low
    // surrogates in a row ("\udfff\udc00"), so one such pair made the whole email unreadable
    // (found by the monkey test). A browser never sends them; a pasting page's script can.
    const input = (tooLarge ? html.slice(0, MAX_PASTE_HTML_CHARS) : html).toWellFormed();
    parse(input, { treeAdapter });
    return { document, complete: !tooLarge };
  } catch (error) {
    if (error instanceof TooDeep) return { document, complete: false };
    throw error;
  }
}

/** Text of a node and its children (like `textContent`). */
function textOf(node: HtmlNode): string {
  const parts: string[] = [];
  walk(node, (current) => {
    const text = textValue(current);
    if (text !== undefined) parts.push(text);
  });
  return parts.join('');
}

function attribute(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((attr) => attr.name === name)?.value;
}

/** The `<a href>` elements, in document order, at most {@link MAX_LINKS}. */
function anchorsOf(document: HtmlNode): HtmlElement[] {
  const anchors: HtmlElement[] = [];
  walk(document, (node) => {
    if (anchors.length >= MAX_LINKS) return false;
    if (isElement(node) && node.tagName === 'a' && attribute(node, 'href') !== undefined) {
      anchors.push(node);
    }
  });
  return anchors;
}

function linkText(anchor: HtmlElement): string {
  const text = squeeze(textOf(anchor));
  if (text) return text;
  const alts: string[] = [];
  walk(anchor, (node) => {
    if (isElement(node) && node.tagName === 'img') alts.push(attribute(node, 'alt') ?? '');
  });
  return squeeze(alts.join(' '));
}

/** Elements whose content is not shown as text. */
const NOT_TEXT = new Set(['head', 'script', 'style', 'template', 'title', 'noscript']);
/** Elements that start a new line. */
const BLOCKS = new Set([
  'br',
  'p',
  'div',
  'li',
  'tr',
  'table',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'hr',
]);

/**
 * Readable text of a parsed HTML body. Like the HTML itself, it still contains text that CSS
 * would hide (`display: none`).
 */
function visibleText(document: HtmlNode): string {
  const parts: string[] = [];
  walk(document, (node) => {
    if (isElement(node) && NOT_TEXT.has(node.tagName)) return false;
    if (isElement(node) && BLOCKS.has(node.tagName)) parts.push('\n');
    const text = textValue(node);
    if (text !== undefined) parts.push(text);
  });
  return parts
    .join('')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Text of the first `<pre>`, with entities decoded and whitespace kept. Gmail's "Show original"
 * page has exactly one, holding the raw email (measured 16 Nov 2026).
 */
export function preText(html: string): string | undefined {
  const { document } = parseLimited(html);
  let pre: HtmlNode | undefined;
  walk(document, (node) => {
    if (pre) return false;
    if (isElement(node) && node.tagName === 'pre') {
      pre = node;
      return false;
    }
  });
  return pre && textOf(pre);
}

/** What an email's HTML contains, read once. `complete` is false if part was too large or deep. */
export interface HtmlContent {
  text: string;
  links: EmailLink[];
  complete: boolean;
}

export function readHtml(html: string): HtmlContent {
  const { document, complete } = parseLimited(html);
  const links = anchorsOf(document).map((anchor) => ({
    text: linkText(anchor),
    href: (attribute(anchor, 'href') ?? '').trim(),
  }));
  return { text: visibleText(document), links, complete };
}

/** `http(s)://…` and `www.…` in plain text; trailing punctuation is not part of the URL. */
const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

function linksFromText(text: string): EmailLink[] {
  return [...text.matchAll(URL_IN_TEXT)].flatMap(([match]) => {
    const url = match.replace(/[.,;:!?)\]}]+$/, '');
    const valid = URL.canParse(url.startsWith('www.') ? `https://${url}` : url);
    return valid ? [{ text: url, href: url }] : [];
  });
}

/** "Name <address>", "<address>" or "address". */
function parseSender(sender: string): Email['sender'] {
  const match = /^(.*?)\s*<([^<>]*)>\s*$/.exec(sender.trim());
  if (match) {
    return {
      name: squeeze((match[1] ?? '').replace(/^"|"$/g, '')),
      address: (match[2] ?? '').trim(),
    };
  }
  const value = squeeze(sender);
  return value.includes('@') ? { name: '', address: value } : { name: value, address: '' };
}

/** The parts every email source provides; links come from the HTML and the text. */
export interface EmailParts {
  text: string;
  html?: HtmlContent;
  sender: Email['sender'];
  subject: string;
}

export function buildEmail({ text, html, sender, subject }: EmailParts): Email {
  const body = text.trim();
  const links = [...(html?.links ?? [])];
  const known = new Set(links.map((link) => link.href));
  for (const link of linksFromText(body)) {
    if (!known.has(link.href)) {
      known.add(link.href);
      links.push(link);
    }
  }
  return {
    sender: cutMailbox({ name: squeeze(sender.name), address: sender.address.trim() }),
    subject: cut(squeeze(subject), FIELD_LIMITS.subject),
    bodyText: body.slice(0, MAX_BODY_CHARS),
    links: links.slice(0, MAX_LINKS).map(cutLink),
    truncated: body.length > MAX_BODY_CHARS,
    ...(html && !html.complete ? { incomplete: true } : {}),
  };
}

export function parsePastedEmail({ text, html, sender = '', subject = '' }: PastedEmail): Email {
  return buildEmail({
    text,
    html: html ? readHtml(html) : undefined,
    sender: parseSender(sender),
    subject,
  });
}
