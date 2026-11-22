/*
 * The judges build (`npm run build:judges`) carries a second App Check debug token so judges can
 * use the cloud deep check without any setup. These tests keep it apart from the normal build.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { parseEnv } from 'node:util';
import type { UserConfig, UserConfigFnObject } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import viteConfig, { JUDGES_MODE, JUDGES_OUT_DIR } from '../vite.config';
import {
  findDeniedRemoteHosts,
  findRemoteCodeInFile,
  fromRoot,
  readText,
  toPosixRelative,
  walkFiles,
} from './helpers';

const TOKEN_KEY = 'VITE_APPCHECK_JUDGES_TOKEN';

function configFor(mode: string): UserConfig {
  return (viteConfig as UserConfigFnObject)({ mode, command: 'build' }) as UserConfig;
}

/** Runs `fn` with the working directory set to an empty folder (no .env files). */
function inEmptyDir<T>(fn: () => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'phishlocal-judges-'));
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
  try {
    return fn();
  } finally {
    cwd.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
}

const isGitIgnored = (path: string): boolean => {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: fromRoot() });
    return true;
  } catch {
    return false;
  }
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('judges build', () => {
  it('writes to its own folder, never to dist/', () => {
    vi.stubEnv(TOKEN_KEY, 'zq-test-judges-token');
    expect(inEmptyDir(() => configFor(JUDGES_MODE).build?.outDir)).toBe(JUDGES_OUT_DIR);
    expect(inEmptyDir(() => configFor('production').build?.outDir)).toBe('dist');
  });

  it("refuses the developer's own token as the judges' token", () => {
    vi.stubEnv(TOKEN_KEY, 'zq-same-token');
    vi.stubEnv('VITE_APPCHECK_DEBUG_TOKEN', 'zq-same-token');
    expect(() => inEmptyDir(() => configFor(JUDGES_MODE))).toThrow(/its own token/);
  });

  it('fails without its token instead of building a judges build without the deep check', () => {
    vi.stubEnv(TOKEN_KEY, '');
    expect(() => inEmptyDir(() => configFor(JUDGES_MODE))).toThrow(TOKEN_KEY);
    vi.stubEnv(TOKEN_KEY, '   ');
    expect(() => inEmptyDir(() => configFor(JUDGES_MODE))).toThrow(TOKEN_KEY);
  });

  it('keeps its output and its token file out of git', () => {
    expect(isGitIgnored(`${JUDGES_OUT_DIR}/manifest.json`)).toBe(true);
    expect(isGitIgnored('.env.judges.local')).toBe(true);
  });

  it('is the only mode besides dev that reads a debug token, and is checked first', () => {
    // The token must sit behind a condition that is constant `false` in `npm run build`.
    const source = readText(fromRoot('src/firebase.ts'));
    expect(source).toContain(`import.meta.env.MODE === '${JUDGES_MODE}'`);
    // The judges mode comes first: .env.local (the developer's token) is loaded in every mode,
    // so a judges build that somehow had DEV on must still never read it.
    expect(source.match(/VITE_APPCHECK_\w+/g)).toEqual([
      'VITE_APPCHECK_JUDGES_TOKEN',
      'VITE_APPCHECK_DEBUG_TOKEN',
    ]);
  });
});

const judgesDir = fromRoot(JUDGES_OUT_DIR);

/** The developer's tokens in the local .env files and the environment (never printed). */
function developerTokens(): string[] {
  const files = readdirSync(fromRoot(), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith('.env'))
    .filter((entry) => entry.name !== '.env.example');
  return [
    ...files.map((entry) => parseEnv(readText(fromRoot(entry.name))).VITE_APPCHECK_DEBUG_TOKEN),
    process.env.VITE_APPCHECK_DEBUG_TOKEN,
  ]
    .map((value) => value?.trim() ?? '')
    .filter((value) => value !== '');
}

// The build the judges install, checked like dist/ when it exists (it is built only locally).
describe.runIf(existsSync(join(judgesDir, 'manifest.json')))('dist-judges/ build output', () => {
  const files = existsSync(judgesDir) ? walkFiles(judgesDir) : [];

  it("does not contain the developer's own debug token", () => {
    const tokens = developerTokens();
    const leaks = files
      .filter((file) => tokens.some((token) => readText(file).includes(token)))
      .map((file) => toPosixRelative(judgesDir, file));
    expect(leaks).toEqual([]);
  });

  it('contains no remote code loading and no .env files', () => {
    const problems = files.flatMap((file) => {
      const name = toPosixRelative(judgesDir, file);
      if (basename(file).startsWith('.env')) return [`${name}: .env file`];
      if (!['.js', '.mjs', '.cjs', '.html', '.css'].includes(extname(file))) return [];
      const text = readText(file);
      return [...findRemoteCodeInFile(name, text), ...findDeniedRemoteHosts(text)].map(
        (hit) => `${name}: ${hit}`,
      );
    });
    expect(problems).toEqual([]);
  });
});
