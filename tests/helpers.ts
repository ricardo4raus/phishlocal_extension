import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the repository root (independent of the current working directory). */
export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export const fromRoot = (...parts: string[]): string => join(repoRoot, ...parts);

export const readText = (path: string): string => readFileSync(path, 'utf8');

export const readJson = <T = unknown>(path: string): T => JSON.parse(readText(path)) as T;

/** Path relative to `base`, always with forward slashes (for readable test output). */
export const toPosixRelative = (base: string, path: string): string =>
  relative(base, path).split(sep).join('/');

/** Recursively lists all files below `dir` (absolute paths). */
export function walkFiles(dir: string): string[] {
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

// `http://`, `https://` or protocol-relative `//`.
const REMOTE = String.raw`(?:https?:)?\/\/`;
const QUOTE = '[\'"`]';

/**
 * Patterns that load *code* from a remote URL (forbidden in MV3 / by project rules).
 * Plain URL string literals (e.g. API endpoints in the Firebase SDK) are intentionally NOT matched.
 */
export const REMOTE_CODE_PATTERNS: readonly { name: string; regex: RegExp }[] = [
  {
    name: 'importScripts() of a remote URL',
    regex: new RegExp(String.raw`\bimportScripts\s*\([^)]*?${QUOTE}${REMOTE}`, 'g'),
  },
  {
    name: 'dynamic import() of a remote URL',
    regex: new RegExp(String.raw`\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?${QUOTE}${REMOTE}`, 'g'),
  },
  {
    name: 'static import/export from a remote URL',
    regex: new RegExp(String.raw`\b(?:import|export)\b[^;'"\x60]*?\bfrom\s*${QUOTE}${REMOTE}`, 'g'),
  },
  {
    name: 'side-effect import of a remote URL',
    regex: new RegExp(String.raw`\bimport\s*${QUOTE}${REMOTE}`, 'g'),
  },
  {
    name: '<script src> with a remote URL',
    regex: new RegExp(String.raw`<script\b[^>]*?\bsrc\s*=\s*\\?['"]?${REMOTE}`, 'gi'),
  },
];

/** Returns a human-readable description of every remote code loading pattern found in `text`. */
export function findRemoteCodeLoads(text: string): string[] {
  const hits: string[] = [];
  for (const { name, regex } of REMOTE_CODE_PATTERNS) {
    for (const match of text.matchAll(regex)) {
      hits.push(`${name}: ${match[0].slice(0, 120)}`);
    }
  }
  return hits;
}

/** True if a URL in an HTML attribute points outside the extension (scheme or `//`). */
export const isNonLocalUrl = (url: string): boolean =>
  /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url.trim());

/** Extracts `<script src>` and `<link href>` values from an HTML document. */
export function htmlResourceUrls(html: string): string[] {
  const urls: string[] = [];
  const tagRegex = /<(script|link)\b[^>]*>/gi;
  for (const [tag, name] of html.matchAll(tagRegex)) {
    const attr = name.toLowerCase() === 'script' ? 'src' : 'href';
    const attrMatch = new RegExp(
      String.raw`\b${attr}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`,
      'i',
    ).exec(tag);
    if (attrMatch) {
      urls.push(attrMatch[1] ?? attrMatch[2] ?? attrMatch[3]);
    }
  }
  return urls;
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
  content_security_policy?: string | Record<string, string | undefined>;
  [key: string]: unknown;
}

/** Returns the problems in a CSP string that would allow remote or eval'd script code. */
export function unsafeScriptSources(csp: string): string[] {
  const directives = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), sources);
  }
  // script-src falls back to default-src; worker-src also controls service worker / worker code.
  const scriptSources = [
    ...(directives.get('script-src') ?? directives.get('default-src') ?? []),
    ...(directives.get('script-src-elem') ?? []),
    ...(directives.get('worker-src') ?? []),
  ];
  return scriptSources.filter(
    (source) =>
      /^'unsafe-eval'$/i.test(source) ||
      /^(https?:|\*|\/\/)/i.test(source) ||
      source.includes('://'),
  );
}
