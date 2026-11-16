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
import { type DefaultTreeAdapterTypes, parse } from 'parse5';
import { type Email, type EmailLink, MAX_BODY_CHARS, MAX_LINKS } from '../email';

/** Larger HTML is ignored (links then come from the text only), so a huge paste cannot hang. */
export const MAX_PASTE_HTML_CHARS = 2_000_000;

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

const squeeze = (text: string): string => text.replace(/\s+/g, ' ').trim();

const isElement = (node: HtmlNode): node is HtmlElement => 'tagName' in node;

/** Text of a node and its children (like `textContent`). */
function textOf(node: HtmlNode): string {
  if ('value' in node && node.nodeName === '#text') return node.value;
  return 'childNodes' in node ? node.childNodes.map(textOf).join('') : '';
}

function attribute(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((attr) => attr.name === name)?.value;
}

/** Every `<a href>` in the HTML, in document order (including `<template>` contents). */
function anchorsOf(html: string): HtmlElement[] {
  const anchors: HtmlElement[] = [];
  const visit = (node: HtmlNode): void => {
    if (isElement(node) && node.tagName === 'a' && attribute(node, 'href') !== undefined) {
      anchors.push(node);
    }
    if ('childNodes' in node) node.childNodes.forEach(visit);
    if ('content' in node) visit(node.content);
  };
  visit(parse(html));
  return anchors;
}

function linkText(anchor: HtmlElement): string {
  const text = squeeze(textOf(anchor));
  if (text) return text;
  const alts: string[] = [];
  const visit = (node: HtmlNode): void => {
    if (isElement(node) && node.tagName === 'img') alts.push(attribute(node, 'alt') ?? '');
    if ('childNodes' in node) node.childNodes.forEach(visit);
  };
  visit(anchor);
  return squeeze(alts.join(' '));
}

function linksFromHtml(html: string): EmailLink[] {
  if (html.length > MAX_PASTE_HTML_CHARS) return [];
  return anchorsOf(html).map((anchor) => ({
    text: linkText(anchor),
    href: (attribute(anchor, 'href') ?? '').trim(),
  }));
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

export function parsePastedEmail({ text, html, sender = '', subject = '' }: PastedEmail): Email {
  const body = text.trim();
  const links = html ? linksFromHtml(html) : [];
  const known = new Set(links.map((link) => link.href));
  for (const link of linksFromText(body)) {
    if (!known.has(link.href)) {
      known.add(link.href);
      links.push(link);
    }
  }
  return {
    sender: parseSender(sender),
    subject: squeeze(subject),
    bodyText: body.slice(0, MAX_BODY_CHARS),
    links: links.slice(0, MAX_LINKS),
    truncated: body.length > MAX_BODY_CHARS,
  };
}
