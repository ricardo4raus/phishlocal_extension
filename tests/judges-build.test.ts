/*
 * The judges build (`npm run build:judges`) carries a second App Check debug token so judges can
 * use the cloud deep check without any setup. These tests keep it apart from the normal build.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UserConfig, UserConfigFnObject } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import viteConfig, { JUDGES_MODE, JUDGES_OUT_DIR } from '../vite.config';
import { fromRoot, readText } from './helpers';

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

  it('is the only mode besides dev that reads a debug token', () => {
    // The token must sit behind a condition that is constant `false` in `npm run build`.
    const source = readText(fromRoot('src/firebase.ts'));
    expect(source).toContain(`import.meta.env.MODE === '${JUDGES_MODE}'`);
    expect(source.match(/VITE_APPCHECK_\w+/g)).toEqual([
      'VITE_APPCHECK_DEBUG_TOKEN',
      'VITE_APPCHECK_JUDGES_TOKEN',
    ]);
  });
});
