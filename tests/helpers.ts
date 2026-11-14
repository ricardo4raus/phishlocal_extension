import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ESTree, parseSync } from 'vite';

/** Absolute path of the repository root (independent of the current working directory). */
export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export const fromRoot = (...parts: string[]): string => join(repoRoot, ...parts);

export const readText = (path: string): string => readFileSync(path, 'utf8');

export const readJson = <T = unknown>(path: string): T => JSON.parse(readText(path)) as T;

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

/** True if a URL points outside the extension package (any scheme, or protocol-relative `//`). */
export const isNonLocalUrl = (url: string): boolean =>
  /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url.trim());

/** True for network URLs: `http:`, `https:` or protocol-relative `//`. */
export const isRemoteUrl = (url: string): boolean => /^(?:https?:)?\/\//i.test(url.trim());

const isDataUrl = (url: string): boolean => /^data:/i.test(url.trim());

/** Shortens a code snippet for failure messages. */
const snippet = (text: string, max = 160): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/* ------------------------------------------------------------------------------------------------
 * JS / TS: AST-based remote code detection
 * --------------------------------------------------------------------------------------------- */

type Node = ESTree.Node;

/** Calls `visit` for every AST node below `root` (generic walk over all child properties). */
function walk(root: unknown, visit: (node: Node) => void): void {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      stack.push(...value);
    } else if (value !== null && typeof value === 'object') {
      if (typeof (value as { type?: unknown }).type === 'string') visit(value as Node);
      for (const [key, child] of Object.entries(value)) {
        if (key !== 'parent' && child !== null && typeof child === 'object') stack.push(child);
      }
    }
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

const isLocationObject = (node: Node): boolean =>
  (node.type === 'Identifier' && node.name === 'location') ||
  (node.type === 'MemberExpression' && propertyName(node.property) === 'location');

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
 * - dynamic `import()` whose source is not a local string literal (variables, `${}` templates)
 * - `importScripts()`, `new Worker()`, `new SharedWorker()` with a non-local argument
 * - `eval()`, `new Function()` / `Function()` (blocked by the MV3 CSP anyway)
 * - `document.createElement('script')` (extension pages have no reason to inject script tags)
 * - `x.src = 'https://…'` / `x.href = 'https://…'` and `setAttribute('src'|'href', 'https://…')`
 *   with a remote literal (navigation via `location.href` is not code loading and is allowed)
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
        if (!isLocalSource(node.source)) hit('dynamic import() of a non-local source', node);
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
            ['src', 'href'].includes(staticString(args[0])?.toLowerCase() ?? '') &&
            isRemoteLiteral(args[1])
          ) {
            hit('sets a remote src/href attribute', node);
          }
        }
        break;
      }
      case 'AssignmentExpression': {
        const target = node.left;
        if (
          target.type === 'MemberExpression' &&
          ['src', 'href'].includes(propertyName(target) ?? '') &&
          !isLocationObject(target.object) &&
          isRemoteLiteral(node.right)
        ) {
          hit('assigns a remote URL to src/href', node);
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
export const DENIED_REMOTE_SCRIPT_HOSTS: readonly string[] = [
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
    /@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1/gi,
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
 * --------------------------------------------------------------------------------------------- */

/** Which attributes of which tags make the browser fetch a resource. */
const RESOURCE_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  script: ['src'],
  link: ['href'],
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
};

// Quote-aware: a `>` inside an attribute value does not end the tag.
const TAG_REGEX = /<([a-z][a-z\d-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
// `(?:^|\s)` so `data-src` is not read as `src`.
const ATTR_REGEX = /(?:^|\s)([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

const stripHtmlComments = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, '');

const INLINE_BLOCK_REGEX = /<(script|style)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>/gi;

function parseAttributes(attrText: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const match of attrText.matchAll(ATTR_REGEX)) {
    const name = (match[1] ?? '').toLowerCase();
    if (name && !attrs.has(name)) attrs.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

export interface HtmlResource {
  tag: string;
  attr: string;
  url: string;
}

/** Every resource URL an HTML document loads (`<script src>`, `<link href>`, `<img src>`, …). */
export function htmlResources(html: string): HtmlResource[] {
  const resources: HtmlResource[] = [];
  // Drop inline script/style contents first: tags inside JS strings are data, not elements.
  const markup = stripHtmlComments(html).replace(INLINE_BLOCK_REGEX, '<$1$2></$1>');
  for (const match of markup.matchAll(TAG_REGEX)) {
    const tag = (match[1] ?? '').toLowerCase();
    const attrs = parseAttributes(match[2] ?? '');
    for (const attr of RESOURCE_ATTRIBUTES[tag] ?? []) {
      const value = attrs.get(attr);
      if (value === undefined) continue;
      const urls =
        attr === 'srcset'
          ? value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
          : [value.trim()];
      for (const url of urls) {
        if (url !== '') resources.push({ tag, attr, url });
      }
    }
  }
  return resources;
}

/** Contents of inline `<script>` (JS only) and `<style>` elements. */
export function inlineBlocks(html: string): { kind: 'script' | 'style'; code: string }[] {
  const blocks: { kind: 'script' | 'style'; code: string }[] = [];
  for (const match of stripHtmlComments(html).matchAll(INLINE_BLOCK_REGEX)) {
    const kind = (match[1] ?? '').toLowerCase() as 'script' | 'style';
    const type =
      parseAttributes(match[2] ?? '')
        .get('type')
        ?.toLowerCase() ?? '';
    const code = match[3] ?? '';
    if (code.trim() === '') continue;
    if (
      kind === 'script' &&
      !['', 'module', 'text/javascript', 'application/javascript'].includes(type)
    ) {
      continue; // JSON data blocks etc. are not executed
    }
    blocks.push({ kind, code });
  }
  return blocks;
}

/**
 * Problems in an HTML page: resources from outside the package (`data:` is fine except for
 * scripts) and remote code in inline `<script>` / `<style>` blocks.
 * Existence of local files is checked separately (only meaningful for build output).
 */
export function findHtmlProblems(html: string): string[] {
  const problems: string[] = [];
  for (const { tag, attr, url } of htmlResources(html)) {
    if (isNonLocalUrl(url) && !(isDataUrl(url) && tag !== 'script')) {
      problems.push(`<${tag} ${attr}> loads non-local URL ${snippet(url)}`);
    }
  }
  for (const { kind, code } of inlineBlocks(html)) {
    const found =
      kind === 'script' ? findRemoteCodeLoads(code, 'inline.js') : findCssRemoteUrls(code);
    problems.push(...found.map((hit) => `inline <${kind}>: ${hit}`));
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
export const GOOGLE_API_KEY_REGEX = /AIza[0-9A-Za-z_-]{35}/g;

/** `line N: AIzaSy…` for every API key in `text` (masked, so the failure output leaks nothing). */
export function findApiKeys(text: string): string[] {
  return [...text.matchAll(GOOGLE_API_KEY_REGEX)].map((match) => {
    const line = text.slice(0, match.index).split('\n').length;
    return `line ${line}: ${match[0].slice(0, 6)}…`;
  });
}

/* ------------------------------------------------------------------------------------------------
 * Manifest + CSP
 * --------------------------------------------------------------------------------------------- */

export interface ContentScript {
  matches?: string[];
  exclude_matches?: string[];
  js?: string[];
  css?: string[];
  all_frames?: boolean;
  [key: string]: unknown;
}

export interface WebAccessibleResource {
  resources?: string[];
  matches?: string[];
  extension_ids?: string[];
  [key: string]: unknown;
}

export interface Manifest {
  manifest_version?: number;
  name?: string;
  version?: string;
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
  content_security_policy?: string | Record<string, string | undefined>;
  [key: string]: unknown;
}

/** CSP directives that control where code may come from. */
const CODE_DIRECTIVES = [
  'default-src',
  'script-src',
  'script-src-elem',
  'worker-src',
  'child-src',
  'object-src',
];
const ALLOWED_CODE_SOURCES = new Set(["'self'", "'none'", "'wasm-unsafe-eval'"]);

/**
 * Allow-list check for `content_security_policy.extension_pages`: code directives may only use
 * `'self'`, `'none'` and `'wasm-unsafe-eval'`. Like browsers, the FIRST occurrence of a duplicated
 * directive wins.
 */
export function cspProblems(csp: string): string[] {
  const directives = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    const key = name?.toLowerCase();
    if (key && !directives.has(key)) directives.set(key, sources);
  }
  const problems: string[] = [];
  for (const directive of CODE_DIRECTIVES) {
    for (const source of directives.get(directive) ?? []) {
      if (!ALLOWED_CODE_SOURCES.has(source.toLowerCase())) {
        problems.push(`${directive} allows ${source}`);
      }
    }
  }
  return problems;
}

/** Match patterns that expose the extension to every website. */
export const BROAD_MATCHES: readonly string[] = [
  '<all_urls>',
  '*://*/*',
  'http://*/*',
  'https://*/*',
];

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
      if (BROAD_MATCHES.includes(match)) problems.push(`[${i}] exposed to every site: ${match}`);
      else if (!allowed.includes(match)) problems.push(`[${i}] match not allow-listed: ${match}`);
    }
    if (entry.extension_ids) problems.push(`[${i}] exposed to other extensions`);
    return problems;
  });
}
