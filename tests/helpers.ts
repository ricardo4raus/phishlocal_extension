import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DefaultTreeAdapterTypes, parse } from 'parse5';
import { type ESTree, parseSync } from 'vite';

/** Absolute path of the repository root (independent of the current working directory). */
export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export const fromRoot = (...parts: string[]): string => join(repoRoot, ...parts);

export const readText = (path: string): string => readFileSync(path, 'utf8');

export const readJson = <T = unknown>(path: string): T => JSON.parse(readText(path)) as T;

/** Sorted copy (`undefined` = empty list), for order-independent comparisons. */
export const sorted = (list: readonly string[] | undefined): string[] => (list ?? []).toSorted();

/** Path relative to `base`, always with forward slashes (for readable test output). */
export const toPosixRelative = (base: string, path: string): string =>
  relative(base, path).split(sep).join('/');

/** Recursively lists all files below `dir` (absolute paths). A missing `dir` yields `[]`. */
export function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Normalizes an extension-relative path (`/a/./b.js`, `a\b.js`) to `a/b.js`.
 * Returns `undefined` if the path escapes the base directory (`../x`).
 */
export function normalizeInside(path: string): string | undefined {
  const normalized = posix.normalize(path.replaceAll('\\', '/').replace(/^\/+/, ''));
  if (normalized === '..' || normalized.startsWith('../') || posix.isAbsolute(normalized)) {
    return undefined;
  }
  return normalized;
}

/**
 * Exact-case file check (Windows and macOS file systems are case-insensitive, Chrome's
 * extension loader and Linux CI are not). Rejects paths that escape `baseDir`.
 */
export function fileExistsExactCase(baseDir: string, path: string): boolean {
  const normalized = normalizeInside(path);
  if (normalized === undefined || normalized === '.') return false;
  let dir = baseDir;
  for (const segment of normalized.split('/')) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
    if (!readdirSync(dir).includes(segment)) return false;
    dir = join(dir, segment);
  }
  return statSync(dir).isFile();
}

/* ------------------------------------------------------------------------------------------------
 * URL classification
 * --------------------------------------------------------------------------------------------- */

/**
 * A URL as the browser's URL parser reads it: ASCII tabs and newlines are removed everywhere,
 * leading and trailing control characters and spaces are dropped. A backslash is read as `/`
 * (browsers do that for http(s) URLs; for the check, treating `\\host` like `//host` is stricter).
 */
function cleanUrl(url: string): string {
  const text = url.replace(/[\t\n\r]/g, '').replaceAll('\\', '/');
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) <= 0x20) start++;
  while (end > start && text.charCodeAt(end - 1) <= 0x20) end--;
  return text.slice(start, end);
}

/** True if a URL points outside the extension package (any scheme, or protocol-relative `//`). */
export const isNonLocalUrl = (url: string): boolean =>
  /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(cleanUrl(url));

/** True for network URLs: `http:`, `https:` or protocol-relative `//`. */
const isRemoteUrl = (url: string): boolean => /^(?:https?:)?\/\//i.test(cleanUrl(url));

const isDataUrl = (url: string): boolean => /^data:/i.test(cleanUrl(url));

/** Shortens a code snippet for failure messages. */
const snippet = (text: string, max = 160): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/* ------------------------------------------------------------------------------------------------
 * JS / TS: AST-based remote code detection
 * --------------------------------------------------------------------------------------------- */

type Node = ESTree.Node;

/**
 * Calls `visit` for every AST node below `root`, in source order (depth-first walk over all child
 * properties). Children are pushed in reverse, one by one, so they are popped first-to-last;
 * `push(...array)` would throw a RangeError for very large arrays (e.g. a big lookup table).
 */
function walk(root: unknown, visit: (node: Node) => void): void {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      for (const item of value.toReversed()) stack.push(item);
      continue;
    }
    if (typeof (value as { type?: unknown }).type === 'string') visit(value as Node);
    const children = Object.entries(value).filter(
      ([key, child]) => key !== 'parent' && child !== null && typeof child === 'object',
    );
    for (const [, child] of children.toReversed()) stack.push(child);
  }
}

/** Value of a string literal or of a template literal without `${}` expressions. */
function staticString(node: Node | null | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

/** The known string prefix of an expression: `'https://x' + y`, `` `https://${host}` ``, … */
function leadingString(node: Node | null | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'TemplateLiteral') return node.quasis[0]?.value.cooked ?? undefined;
  if (node.type === 'BinaryExpression' && node.operator === '+') return leadingString(node.left);
  return staticString(node);
}

/** `foo` for `foo`, `self.foo`, `a.b.foo`, `a['foo']` (the called/accessed name). */
function propertyName(node: Node | null | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') {
    return node.computed ? staticString(node.property) : propertyName(node.property);
  }
  return undefined;
}

/** `eval` / `self.eval` / `globalThis.eval` style: a bare global or a member of a global object. */
function globalName(node: Node): string | undefined {
  if (node.type === 'Identifier') return node.name;
  if (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    ['self', 'window', 'globalThis'].includes(node.object.name)
  ) {
    return propertyName(node);
  }
  return undefined;
}

/** `import.meta.url`, or `'' + import.meta.url` as Vite emits it for workers. */
const isImportMetaUrl = (node: Node | undefined): boolean =>
  (node?.type === 'MemberExpression' &&
    node.object.type === 'MetaProperty' &&
    propertyName(node.property) === 'url') ||
  (node?.type === 'BinaryExpression' &&
    node.operator === '+' &&
    staticString(node.left) === '' &&
    isImportMetaUrl(node.right));

/**
 * True if `node` is a module/script source that is guaranteed to be inside the package:
 * a local string literal, `new URL('<local>', import.meta.url)` (Vite's worker/asset pattern),
 * its `.href`, `chrome.runtime.getURL('<local>')`, or `'' + <one of those>`.
 */
function isLocalSource(node: Node | null | undefined): boolean {
  if (!node) return false;
  const value = staticString(node);
  if (value !== undefined) return !isNonLocalUrl(value);
  if (node.type === 'NewExpression' && globalName(node.callee) === 'URL') {
    const [first, base] = node.arguments as Node[];
    return isLocalSource(first) && isImportMetaUrl(base);
  }
  // chrome.runtime.getURL('assets/x.js'): crxjs content-script loaders import chunks this way.
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    propertyName(node.callee) === 'getURL' &&
    node.callee.object.type === 'MemberExpression' &&
    propertyName(node.callee.object) === 'runtime' &&
    node.arguments.length === 1
  ) {
    return isLocalSource(node.arguments[0] as Node);
  }
  if (node.type === 'MemberExpression' && propertyName(node.property) === 'href') {
    return isLocalSource(node.object);
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return staticString(node.left) === '' && isLocalSource(node.right);
  }
  return false;
}

const isRemoteLiteral = (node: Node | null | undefined): boolean => {
  const prefix = leadingString(node);
  return prefix !== undefined && isRemoteUrl(prefix);
};

/**
 * `` `./locales/${lang}.ts` `` or `'./locales/' + lang`: a relative path pattern. Vite bundles every
 * matching file, and a URL starting with `./` or `../` always resolves inside the extension origin.
 */
const isLocalPathPattern = (node: Node | null | undefined): boolean =>
  /^\.\.?\//.test(leadingString(node) ?? '');

const langFor = (filename: string): 'js' | 'ts' | 'tsx' | 'jsx' =>
  /\.[cm]?tsx$/i.test(filename)
    ? 'tsx'
    : /\.[cm]?ts$/i.test(filename)
      ? 'ts'
      : /\.jsx$/i.test(filename)
        ? 'jsx'
        : 'js';

/**
 * Finds code that LOADS or EVALUATES code from outside the extension package (forbidden in MV3 and
 * by the project rules). Works on the AST, so plain string data is never flagged: a phishing
 * detector may legitimately contain `'<script src="https://evil.example/x.js">'` as sample text.
 *
 * Flagged:
 * - static `import`/`export … from` with a URL source (`https:`, `//`, `data:`, …)
 * - dynamic `import()` of a variable, or of a template/concatenation not starting with `./` or
 *   `../` (`` import(`./locales/${lang}.ts`) `` is fine)
 * - `importScripts()`, `new Worker()`, `new SharedWorker()` with a non-local argument
 * - `eval()`, `new Function()` / `Function()` (blocked by the MV3 CSP anyway)
 * - `document.createElement('script')` (extension pages have no reason to inject script tags)
 * - `x.src = 'https://…'` and `setAttribute('src', 'https://…')` with a remote literal. `href` is
 *   not checked: links and `location.href` navigate, they do not load code.
 */
export function findRemoteCodeLoads(code: string, filename = 'input.js'): string[] {
  const result = parseSync(filename, code, {
    lang: langFor(filename),
    sourceType: 'module',
    preserveParens: false,
  });
  if (result.errors.length > 0) {
    return [`could not parse ${filename}: ${result.errors[0]?.message ?? 'unknown error'}`];
  }

  const hits: string[] = [];
  const hit = (what: string, node: Node): void => {
    hits.push(`${what}: ${snippet(code.slice(node.start, node.end))}`);
  };

  walk(result.program, (node) => {
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'ExportNamedDeclaration': {
        if (node.source && !isLocalSource(node.source)) hit('import/export from a URL', node);
        break;
      }
      case 'ImportExpression': {
        if (!isLocalSource(node.source) && !isLocalPathPattern(node.source)) {
          hit('dynamic import() of a non-local source', node);
        }
        break;
      }
      case 'CallExpression':
      case 'NewExpression': {
        const callee = node.callee;
        const name = globalName(callee);
        const args = node.arguments as Node[];
        if (name === 'eval' || name === 'Function') {
          hit(`${name}() evaluates code from strings`, node);
        } else if (name === 'importScripts' && !args.every((arg) => isLocalSource(arg))) {
          hit('importScripts() of a non-local source', node);
        } else if (
          node.type === 'NewExpression' &&
          (name === 'Worker' || name === 'SharedWorker') &&
          !isLocalSource(args[0])
        ) {
          hit(`new ${name}() with a non-local script`, node);
        } else if (callee.type === 'MemberExpression') {
          const method = propertyName(callee);
          if (
            (method === 'createElement' || method === 'createElementNS') &&
            args.some((arg) => staticString(arg)?.toLowerCase() === 'script')
          ) {
            hit('creates a <script> element', node);
          } else if (
            method === 'setAttribute' &&
            staticString(args[0])?.toLowerCase() === 'src' &&
            isRemoteLiteral(args[1])
          ) {
            hit('sets a remote src attribute', node);
          }
        }
        break;
      }
      case 'AssignmentExpression': {
        const target = node.left;
        if (
          target.type === 'MemberExpression' &&
          propertyName(target) === 'src' &&
          isRemoteLiteral(node.right)
        ) {
          hit('assigns a remote URL to src', node);
        }
        break;
      }
      default:
        break;
    }
  });
  return hits;
}

/**
 * Remote script hosts that Firebase (and Google SDKs in general) inject as `<script>` tags. These
 * must never be in the bundle: MV3 blocks them and they would break at runtime.
 * - Firebase Auth: import from `firebase/auth/web-extension`, not `firebase/auth` (the browser
 *   build loads gapi + reCAPTCHA).
 * - App Check: reCAPTCHA providers do not work in extensions; use a debug or custom provider.
 */
const DENIED_REMOTE_SCRIPT_HOSTS: readonly string[] = [
  'apis.google.com/js/api.js',
  'google.com/recaptcha/',
  'gstatic.com/firebasejs',
];

/** Literal search for {@link DENIED_REMOTE_SCRIPT_HOSTS} (for build output only). */
export function findDeniedRemoteHosts(text: string): string[] {
  const hits: string[] = [];
  for (const host of DENIED_REMOTE_SCRIPT_HOSTS) {
    let index = text.indexOf(host);
    while (index !== -1) {
      hits.push(
        `remote script host ${host}: ${snippet(text.slice(Math.max(0, index - 40), index + 80))}`,
      );
      index = text.indexOf(host, index + host.length);
    }
  }
  return hits;
}

/* ------------------------------------------------------------------------------------------------
 * CSS
 * --------------------------------------------------------------------------------------------- */

/** `@import` and `url()` references that point outside the package (`data:` is allowed). */
export function findCssRemoteUrls(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const hits: string[] = [];
  const patterns = [
    /@import\s+(["'])([^"']*)\1/gi, // quoted form; `@import url(…)` is matched by the url() rule
    /url\(\s*(["']?)([^"')]*?)\1\s*\)/gi,
  ];
  for (const regex of patterns) {
    for (const match of text.matchAll(regex)) {
      const url = match[2] ?? '';
      if (isNonLocalUrl(url) && !isDataUrl(url))
        hits.push(`non-local CSS URL: ${snippet(match[0])}`);
    }
  }
  return hits;
}

/* ------------------------------------------------------------------------------------------------
 * HTML
 *
 * Read with parse5, a parser that follows the HTML standard, so the check sees exactly the
 * elements and attribute values the browser sees. Regexes could not: comments (`<!-->`), fake
 * opening tags in comments or attribute values, unquoted values with quotes, and character
 * references (`https&#58;//`) all let a remote script slip through earlier versions.
 * --------------------------------------------------------------------------------------------- */

type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlParent = DefaultTreeAdapterTypes.ParentNode;

/** Which attributes of which elements make the browser fetch a resource. */
const RESOURCE_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  script: ['src', 'href'], // `href` (also `xlink:href`) for SVG `<script>`
  link: ['href', 'imagesrcset'],
  base: ['href'],
  iframe: ['src'],
  frame: ['src'],
  object: ['data'],
  embed: ['src'],
  img: ['src', 'srcset'],
  source: ['src', 'srcset'],
  video: ['src', 'poster'],
  audio: ['src'],
  track: ['src'],
  input: ['src'], // `<input type="image">`
  body: ['background'],
  table: ['background'],
  td: ['background'],
  th: ['background'],
  image: ['href'], // SVG
  use: ['href'], // SVG
  feImage: ['href'], // SVG (parse5 uses the camelCase SVG name)
};

/** Value of an attribute (parse5 lowercases HTML names and keeps only the first duplicate). */
const attribute = (element: HtmlElement, name: string): string | undefined =>
  element.attrs.find((attr) => attr.name === name)?.value;

/** Every element below `root` in document order, including the contents of `<template>`. */
function htmlElements(root: HtmlParent): HtmlElement[] {
  const elements: HtmlElement[] = [];
  const visit = (parent: HtmlParent): void => {
    for (const node of parent.childNodes) {
      if (!('tagName' in node)) continue;
      elements.push(node);
      visit(node);
      if ('content' in node) visit(node.content); // <template>
    }
  };
  visit(root);
  return elements;
}

/** Text content of an element (e.g. the code of an inline `<script>`). */
const textOf = (element: HtmlElement): string =>
  element.childNodes.map((node) => ('value' in node ? node.value : '')).join('');

/**
 * Target of `<meta http-equiv="refresh" content="5; url=…">`, which navigates the page.
 * Follows the standard: optional delay, `;` or `,`, optional `url=`, optional quotes.
 */
function metaRefreshUrl(element: HtmlElement): string | undefined {
  if (attribute(element, 'http-equiv')?.trim().toLowerCase() !== 'refresh') return undefined;
  const target = (attribute(element, 'content') ?? '')
    .replace(/^\s*[\d.]*\s*[;,]?\s*/, '')
    .replace(/^url\s*=\s*/i, '')
    .replace(/^(["'])(.*?)\1?$/, '$2')
    .trim();
  return target === '' ? undefined : target;
}

interface HtmlResource {
  tag: string;
  attr: string;
  url: string;
}

function resourcesOf(elements: readonly HtmlElement[]): HtmlResource[] {
  const resources: HtmlResource[] = [];
  for (const element of elements) {
    const tag = element.tagName;
    const refresh = tag === 'meta' ? metaRefreshUrl(element) : undefined;
    if (refresh !== undefined) resources.push({ tag, attr: 'content', url: refresh });
    for (const attr of RESOURCE_ATTRIBUTES[tag] ?? []) {
      // All matches, not only the first: SVG can carry both `href` and `xlink:href`.
      const values = element.attrs.filter((a) => a.name === attr).map((a) => a.value);
      const urls = values.flatMap((value) =>
        attr.endsWith('srcset')
          ? value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
          : [value.trim()],
      );
      for (const url of urls) {
        if (url !== '') resources.push({ tag, attr, url });
      }
    }
  }
  return resources;
}

/**
 * Every resource URL an HTML document loads (`<script src>`, `<link href>`, `<img src>`, …), as
 * the browser parses it. Comments are ignored like in the browser; `<template>` contents count.
 */
export const htmlResources = (html: string): HtmlResource[] =>
  resourcesOf(htmlElements(parse(html)));

/** Script types the browser executes; others (e.g. `application/json`) are inert data blocks. */
const isExecutedScriptType = (type: string): boolean =>
  ['', 'module', 'importmap'].includes(type) || /(?:java|ecma)script/.test(type);

/**
 * Problems in an HTML page: resources from outside the package (`data:` is fine except for
 * scripts), inline scripts, remote URLs in inline CSS (`<style>` and `style` attributes), and the
 * same problems inside `<iframe srcdoc>`.
 * Existence of local files is checked separately (only meaningful for build output).
 */
export function findHtmlProblems(html: string): string[] {
  const elements = htmlElements(parse(html));
  const problems: string[] = [];
  for (const { tag, attr, url } of resourcesOf(elements)) {
    if (isNonLocalUrl(url) && !(isDataUrl(url) && tag !== 'script')) {
      problems.push(`<${tag} ${attr}> loads non-local URL ${snippet(url)}`);
    }
  }
  for (const element of elements) {
    const tag = element.tagName;
    const style = attribute(element, 'style');
    if (style) problems.push(...findCssRemoteUrls(style).map((hit) => `<${tag} style>: ${hit}`));
    const srcdoc = tag === 'iframe' ? attribute(element, 'srcdoc') : undefined;
    if (srcdoc) problems.push(...findHtmlProblems(srcdoc).map((hit) => `<iframe srcdoc>: ${hit}`));

    const code = textOf(element);
    if (code.trim() === '') continue;
    if (tag === 'style') {
      problems.push(...findCssRemoteUrls(code).map((hit) => `inline <style>: ${hit}`));
    } else if (
      tag === 'script' &&
      isExecutedScriptType(attribute(element, 'type')?.trim().toLowerCase() ?? '')
    ) {
      problems.push(
        `inline <script>${snippet(code, 60)}</script>: MV3 extension pages don't run inline ` +
          'scripts; use <script type="module" src="…">',
      );
    }
  }
  return problems;
}

/* ------------------------------------------------------------------------------------------------
 * Dispatcher
 * --------------------------------------------------------------------------------------------- */

/** Runs the matching detector for a file (by extension). Unknown file types yield `[]`. */
export function findRemoteCodeInFile(filename: string, text: string): string[] {
  if (/\.(?:[cm]?[jt]sx?)$/i.test(filename)) return findRemoteCodeLoads(text, filename);
  if (/\.html?$/i.test(filename)) return findHtmlProblems(text);
  if (/\.css$/i.test(filename)) return findCssRemoteUrls(text);
  return [];
}

/* ------------------------------------------------------------------------------------------------
 * Secrets
 * --------------------------------------------------------------------------------------------- */

/** Google / Firebase browser API key format. */
const GOOGLE_API_KEY_REGEX = /AIza[0-9A-Za-z_-]{35}/g;

/** `line N: AIzaSy…` for every API key in `text` (masked, so the failure output leaks nothing). */
export function findApiKeys(text: string): string[] {
  return [...text.matchAll(GOOGLE_API_KEY_REGEX)].map((match) => {
    const line = text.slice(0, match.index).split('\n').length;
    return `line ${line}: ${match[0].slice(0, 6)}…`;
  });
}

/* ------------------------------------------------------------------------------------------------
 * .env files
 * --------------------------------------------------------------------------------------------- */

/** dotenv-style value: strips an inline ` # comment` and one pair of surrounding quotes. */
function envValue(raw: string): string {
  const trimmed = raw.trim();
  const quoted = /^(["'])(.*)\1(?:\s+#.*)?$/.exec(trimmed);
  if (quoted) return quoted[2] ?? '';
  return trimmed.replace(/(?:^|\s+)#.*$/, '').trim();
}

export interface EnvEntry {
  key: string;
  /** `undefined` for a line without `=`. */
  value: string | undefined;
}

/** Entries of a `.env` file (CRLF-safe; empty lines and `#` comment lines are skipped). */
export function parseEnv(text: string): EnvEntry[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const eq = line.indexOf('=');
      return eq === -1
        ? { key: line, value: undefined }
        : { key: line.slice(0, eq).trim(), value: envValue(line.slice(eq + 1)) };
    });
}

/* ------------------------------------------------------------------------------------------------
 * Manifest
 * --------------------------------------------------------------------------------------------- */

interface ContentScript {
  matches?: string[];
  exclude_matches?: string[];
  js?: string[];
  css?: string[];
  all_frames?: boolean;
  [key: string]: unknown;
}

interface WebAccessibleResource {
  resources?: string[];
  matches?: string[];
  extension_ids?: string[];
  [key: string]: unknown;
}

export interface Manifest {
  manifest_version?: number;
  name?: string;
  version?: string;
  default_locale?: string;
  action?: Record<string, unknown>;
  side_panel?: { default_path?: string };
  background?: { service_worker?: string; type?: string };
  permissions?: string[];
  host_permissions?: string[];
  optional_permissions?: string[];
  optional_host_permissions?: string[];
  content_scripts?: ContentScript[];
  web_accessible_resources?: WebAccessibleResource[];
  externally_connectable?: unknown;
  content_security_policy?: unknown;
  [key: string]: unknown;
}

/** Match patterns that expose the extension to every website. */
const BROAD_MATCHES: readonly string[] = ['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*'];

export const contentScriptMatches = (m: Manifest): string[] => [
  ...new Set((m.content_scripts ?? []).flatMap((cs) => cs.matches ?? [])),
];

/** Problems with `web_accessible_resources`: must only be exposed to our content-script pages. */
export function webAccessibleResourceProblems(m: Manifest, allowed: readonly string[]): string[] {
  return (m.web_accessible_resources ?? []).flatMap((entry, i) => {
    const problems: string[] = [];
    if (!entry.matches || entry.matches.length === 0) {
      if (!entry.extension_ids) problems.push(`[${i}] has no matches`);
    }
    for (const match of entry.matches ?? []) {
      if (BROAD_MATCHES.includes(match)) {
        problems.push(
          `[${i}] exposed to every site: ${match} – declare the Gmail content script in manifest ` +
            "content_scripts with matches ['https://mail.google.com/*'] instead of crxjs `?script` " +
            'injection',
        );
      } else if (!allowed.includes(match)) problems.push(`[${i}] match not allow-listed: ${match}`);
    }
    if (entry.extension_ids) problems.push(`[${i}] exposed to other extensions`);
    return problems;
  });
}
