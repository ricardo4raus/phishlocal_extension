/*
 * Checks the BUILD OUTPUT in dist/. Requires `npm run build` first.
 *
 * If dist/manifest.json is missing, every test here fails with "run `npm run build` first" instead
 * of being skipped: a silent skip would let `npm run check` / CI go green without ever verifying
 * the shipped extension. `npm run check` and CI run build before test, so dist always exists there.
 * To run only the fast source tests locally: `npx vitest run tests/manifest.test.ts tests/source-structure.test.ts`.
 */
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type Manifest,
  findRemoteCodeLoads,
  fromRoot,
  htmlResourceUrls,
  isNonLocalUrl,
  readJson,
  readText,
  toPosixRelative,
  walkFiles,
} from './helpers';

const distDir = fromRoot('dist');
const distManifestPath = join(distDir, 'manifest.json');

let manifest: Manifest;
let files: string[];
/** dist-relative posix paths, e.g. `assets/index-abc.js`. */
let relFiles: string[];

beforeAll(() => {
  if (!existsSync(distManifestPath)) {
    throw new Error('dist/manifest.json not found – run `npm run build` first.');
  }
  manifest = readJson<Manifest>(distManifestPath);
  files = walkFiles(distDir);
  relFiles = files.map((file) => toPosixRelative(distDir, file));
});

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/** Icons can be a single path or a `{ size: path }` map. */
const iconPaths = (icons: unknown): string[] =>
  typeof icons === 'string'
    ? [icons]
    : icons && typeof icons === 'object'
      ? Object.values(icons).filter((v): v is string => typeof v === 'string')
      : [];

/** Every file path the manifest points to (may contain globs for web_accessible_resources). */
function referencedPaths(m: Manifest): string[] {
  const action = (m.action ?? {}) as { default_popup?: string; default_icon?: unknown };
  const optionsUi = m.options_ui as { page?: string } | undefined;
  const sandbox = m.sandbox as { pages?: string[] } | undefined;
  const contentScripts = asArray(m.content_scripts as { js?: string[]; css?: string[] }[]);
  const war = asArray(m.web_accessible_resources as { resources?: string[] }[]);
  const overrides = (m.chrome_url_overrides ?? {}) as Record<string, string>;

  return [
    m.background?.service_worker,
    m.side_panel?.default_path,
    action.default_popup,
    ...iconPaths(action.default_icon),
    ...iconPaths(m.icons),
    m.options_page as string | undefined,
    optionsUi?.page,
    m.devtools_page as string | undefined,
    ...asArray(sandbox?.pages),
    ...Object.values(overrides),
    ...contentScripts.flatMap((cs) => [...asArray(cs.js), ...asArray(cs.css)]),
    ...war.flatMap((entry) => asArray(entry.resources)),
  ].filter((p): p is string => typeof p === 'string' && p !== '');
}

const globToRegExp = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .replace(/^\//, '')
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  );

describe('dist/ build output', () => {
  it('manifest references only files that exist in dist', () => {
    const missing = referencedPaths(manifest).filter((ref) =>
      ref.includes('*')
        ? !relFiles.some((file) => globToRegExp(ref).test(file))
        : !existsSync(join(distDir, ref.replace(/^\//, ''))),
    );
    expect(missing).toEqual([]);
  });

  it('has the same permissions as the source manifest', () => {
    const source = readJson<Manifest>(fromRoot('manifest.json'));
    const keys = [
      'permissions',
      'host_permissions',
      'optional_permissions',
      'optional_host_permissions',
    ] as const;
    for (const key of keys) {
      expect([...(manifest[key] ?? [])].sort(), key).toEqual([...(source[key] ?? [])].sort());
    }
  });

  it('has the same version as the source manifest (detects a stale build)', () => {
    const source = readJson<Manifest>(fromRoot('manifest.json'));
    expect(manifest.version).toBe(source.version);
  });

  it('HTML files load scripts and stylesheets only from local files that exist', () => {
    const problems: string[] = [];
    for (const file of files.filter((f) => extname(f) === '.html')) {
      const name = toPosixRelative(distDir, file);
      for (const url of htmlResourceUrls(readText(file))) {
        if (isNonLocalUrl(url)) {
          problems.push(`${name}: non-local URL ${url}`);
          continue;
        }
        const path = url.split(/[?#]/)[0];
        // `/assets/x.js` is relative to the extension root, `./x.js` to the HTML file.
        const target = path.startsWith('/') ? join(distDir, path) : join(dirname(file), path);
        if (!existsSync(target) || !statSync(target).isFile()) {
          problems.push(`${name}: ${url} does not exist in dist`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('JS files contain no remote code loading', () => {
    const problems = files
      .filter((f) => ['.js', '.mjs', '.cjs'].includes(extname(f)))
      .flatMap((file) =>
        findRemoteCodeLoads(readText(file)).map(
          (hit) => `${toPosixRelative(distDir, file)}: ${hit}`,
        ),
      );
    expect(problems).toEqual([]);
  });

  it('contains no .env files', () => {
    const envFiles = files
      .filter((file) => basename(file).startsWith('.env'))
      .map((file) => toPosixRelative(distDir, file));
    expect(envFiles).toEqual([]);
  });
});
