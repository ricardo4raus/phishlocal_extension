/*
 * Checks the BUILD OUTPUT in dist/. Requires `npm run build` first.
 *
 * If dist/ is missing, stale or a dev build, every test here fails with a clear message instead of
 * being skipped: a silent skip would let `npm run check` / CI go green without ever verifying the
 * shipped extension. `npm run check` and CI run build before test, so dist is fresh there.
 * To run only the fast source tests locally: `npx vitest run tests/manifest.test.ts tests/source-structure.test.ts`.
 */
import { existsSync, statSync } from 'node:fs';
import { basename, extname, join, posix } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { WELCOME_PAGE } from '../src/welcome/open';
import {
  type Manifest,
  contentScriptMatches,
  findDeniedRemoteHosts,
  findRemoteCodeInFile,
  fromRoot,
  htmlResources,
  isNonLocalUrl,
  localEnvValues,
  normalizeInside,
  readJson,
  readText,
  sorted,
  toPosixRelative,
  walkFiles,
  webAccessibleResourceProblems,
} from './helpers';

const distDir = fromRoot('dist');
const distManifestPath = join(distDir, 'manifest.json');

/**
 * Build inputs besides src/** and public/**: if any is newer than dist/manifest.json, dist is stale.
 * (.env.local is not listed: it is optional and not present in CI.)
 */
const BUILD_INPUTS = ['manifest.json', 'vite.config.ts', 'tsconfig.json', 'package-lock.json'];

/** Every debug token a build could see: the developer's (dev builds) and the judges' (judges build). */
const localDebugTokens = (): string[] =>
  localEnvValues(['VITE_APPCHECK_DEBUG_TOKEN', 'VITE_APPCHECK_JUDGES_TOKEN']);

let manifest: Manifest;
let sourceManifest: Manifest;
let files: string[];
/** Exact-case set of dist-relative posix paths, e.g. `assets/index-abc.js`. */
let relFiles: Set<string>;

/** Newest file among the build inputs (src/**, public/** and BUILD_INPUTS). */
function newestBuildInput(): { file: string; mtimeMs: number } {
  const candidates = [
    ...walkFiles(fromRoot('src')),
    ...walkFiles(fromRoot('public')),
    ...BUILD_INPUTS.map((file) => fromRoot(file)).filter((file) => existsSync(file)),
  ];
  let newest = { file: '', mtimeMs: 0 };
  for (const file of candidates) {
    const { mtimeMs } = statSync(file);
    if (mtimeMs > newest.mtimeMs) newest = { file, mtimeMs };
  }
  return newest;
}

beforeAll(() => {
  if (!existsSync(distManifestPath)) {
    throw new Error('dist/manifest.json not found – run `npm run build` first.');
  }
  manifest = readJson<Manifest>(distManifestPath);
  sourceManifest = readJson<Manifest>(fromRoot('manifest.json'));
  files = walkFiles(distDir);
  relFiles = new Set(files.map((file) => toPosixRelative(distDir, file)));

  // `npm run dev` (crxjs) writes a dist/ that loads code from the Vite dev server.
  const loaderFiles = [
    manifest.background?.service_worker,
    ...[...relFiles].filter((file) => file.endsWith('.html')),
  ].filter((file): file is string => typeof file === 'string' && relFiles.has(file));
  for (const file of loaderFiles) {
    const text = readText(join(distDir, file));
    if (/localhost|@crx\/client|\/@vite\//.test(text)) {
      throw new Error(
        `dist/ is a dev build (dist/${file} loads from the dev server) – run \`npm run build\`.`,
      );
    }
  }

  const newest = newestBuildInput();
  if (newest.mtimeMs > statSync(distManifestPath).mtimeMs) {
    const name = toPosixRelative(fromRoot(), newest.file);
    throw new Error(`dist is older than ${name} – run \`npm run build\`.`);
  }
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
    ...asArray(m.content_scripts).flatMap((cs) => [...asArray(cs.js), ...asArray(cs.css)]),
    ...asArray(m.web_accessible_resources).flatMap((entry) => asArray(entry.resources)),
    m.default_locale && `_locales/${m.default_locale}/messages.json`,
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

/** Exact-case existence check of a dist-relative path; paths escaping dist/ never exist. */
const existsInDist = (path: string): boolean => {
  const normalized = normalizeInside(path);
  return normalized !== undefined && relFiles.has(normalized);
};

describe('dist/ build output', () => {
  it('manifest references only files that exist in dist (exact case)', () => {
    const missing = referencedPaths(manifest).filter((ref) =>
      ref.includes('*')
        ? ![...relFiles].some((file) => globToRegExp(ref).test(file))
        : !existsInDist(ref),
    );
    expect(missing).toEqual([]);
  });

  it('has the welcome page that the background opens after an install', () => {
    // Not named in the manifest: built as an extra input (vite.config.ts).
    expect(existsInDist(WELCOME_PAGE)).toBe(true);
  });

  it('has no dev-only batch check page (dev builds only, vite.config.ts)', () => {
    expect([...relFiles].filter((file) => file.startsWith('src/dev/'))).toEqual([]);
    expect(files.some((file) => readText(file).includes('Batch check (dev only)'))).toBe(false);
  });

  it('has the same permissions and content-script matches as the source manifest', () => {
    const keys = [
      'permissions',
      'host_permissions',
      'optional_permissions',
      'optional_host_permissions',
    ] as const;
    for (const key of keys) {
      expect(sorted(manifest[key]), key).toEqual(sorted(sourceManifest[key]));
    }
    expect(sorted(contentScriptMatches(manifest)), 'content_scripts matches').toEqual(
      sorted(contentScriptMatches(sourceManifest)),
    );
    expect(manifest.externally_connectable, 'externally_connectable').toBeUndefined();
  });

  it('exposes web_accessible_resources only to content-script pages', () => {
    // crxjs adds entries for content-script chunks; they must not widen beyond those pages.
    expect(webAccessibleResourceProblems(manifest, contentScriptMatches(sourceManifest))).toEqual(
      [],
    );
  });

  it('has no custom content_security_policy (the MV3 default is what we want)', () => {
    expect(manifest.content_security_policy).toBeUndefined();
  });

  it('has the same version as the source manifest', () => {
    expect(manifest.version).toBe(sourceManifest.version);
  });

  it('HTML files load resources only from local files that exist (exact case)', () => {
    const problems: string[] = [];
    for (const file of [...relFiles].filter((f) => f.endsWith('.html'))) {
      for (const { tag, attr, url } of htmlResources(readText(join(distDir, file)))) {
        if (isNonLocalUrl(url)) continue; // reported by the remote-code test below
        const path = decodeURI(url.split(/[?#]/)[0] ?? '');
        // `/assets/x.js` is relative to the extension root, `./x.js` to the HTML file.
        const target = path.startsWith('/') ? path : posix.join(posix.dirname(file), path);
        if (!existsInDist(target)) {
          problems.push(`${file}: <${tag} ${attr}="${url}"> does not exist in dist`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('JS, HTML and CSS files contain no remote code loading', () => {
    const problems = files.flatMap((file) => {
      const name = toPosixRelative(distDir, file);
      if (!['.js', '.mjs', '.cjs', '.html', '.css'].includes(extname(file))) return [];
      const text = readText(file);
      return [...findRemoteCodeInFile(name, text), ...findDeniedRemoteHosts(text)].map(
        (hit) => `${name}: ${hit}`,
      );
    });
    expect(problems).toEqual([]);
  });

  it('does not contain an App Check debug token', () => {
    // Vite copies every VITE_* value the code reads into the bundle. The debug tokens are
    // secrets, so the source reads them only in dev builds and in the judges build (which goes to
    // dist-judges/). This checks a normal production build really drops both.
    // Without a local token (e.g. in CI) there is nothing to look for.
    const tokens = localDebugTokens();

    // Only file names in the output: a failure message must not leak the token.
    const leaks = files
      .filter((file) => {
        const text = readText(file);
        return tokens.some((token) => text.includes(token));
      })
      .map((file) => toPosixRelative(distDir, file));
    expect(leaks, 'read the tokens only behind `DEV` / `MODE === "judges"`').toEqual([]);
  });

  it('contains no .env files', () => {
    const envFiles = files
      .filter((file) => basename(file).startsWith('.env'))
      .map((file) => toPosixRelative(distDir, file));
    expect(envFiles).toEqual([]);
  });
});
