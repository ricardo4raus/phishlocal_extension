import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findRemoteCodeLoads, fromRoot, readText, toPosixRelative, walkFiles } from './helpers';

const REQUIRED_FILES = [
  'manifest.json',
  'src/background.ts',
  'src/sidepanel/index.html',
  'src/sidepanel/main.ts',
  'src/firebase.ts',
  'LICENSE',
  'README.md',
  '.env.example',
  '.gitignore',
];

const FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

/** Non-empty, non-comment lines of a text file (CRLF-safe). */
const meaningfulLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: fromRoot(), encoding: 'utf8', stdio: 'pipe' });
}

function isGitWorkTree(): boolean {
  try {
    return git(['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch {
    return false;
  }
}

describe('required files', () => {
  it.each(REQUIRED_FILES)('%s exists', (file) => {
    expect(existsSync(fromRoot(file)), `${file} is missing`).toBe(true);
  });
});

describe('LICENSE', () => {
  it('is Apache-2.0', () => {
    const license = readText(fromRoot('LICENSE'));
    expect(license).toContain('Apache License');
    expect(license).toContain('Version 2.0');
  });
});

describe('.env.example', () => {
  const entries = meaningfulLines(readText(fromRoot('.env.example'))).map((line) => {
    const eq = line.indexOf('=');
    return eq === -1
      ? { key: line, value: undefined }
      : { key: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() };
  });

  it('has exactly the Firebase keys (no duplicates, nothing else)', () => {
    const keys = entries.map((entry) => entry.key);
    expect([...keys].sort()).toEqual([...FIREBASE_ENV_KEYS].sort());
  });

  it('has only empty values (never commit real config here)', () => {
    const nonEmpty = entries.filter((entry) => entry.value !== '').map((entry) => entry.key);
    expect(nonEmpty, 'these keys must be written as KEY= with an empty value').toEqual([]);
  });
});

describe('.gitignore', () => {
  // Accept `dist`, `dist/`, `/dist` and `/dist/` style entries.
  const patterns = meaningfulLines(readText(fromRoot('.gitignore'))).map((line) =>
    line.replace(/^\//, '').replace(/\/$/, ''),
  );

  it.each(['.env.local', 'dist', 'node_modules'])('ignores %s', (entry) => {
    expect(patterns).toContain(entry);
  });
});

// CI always has a git checkout. Locally (e.g. a source zip without .git) the check is skipped,
// but never in CI, so a broken git setup there cannot hide a committed secret.
describe.skipIf(!isGitWorkTree() && !process.env.CI)('git tracking of secrets', () => {
  it('does not track .env.local or any other .env file except .env.example', () => {
    const tracked = git(['ls-files', '-z'])
      .split('\0')
      .filter((file) => /(^|\/)\.env(\..*)?$/.test(file) && !file.endsWith('.env.example'));
    expect(tracked, 'remove with: git rm --cached <file>').toEqual([]);
  });

  it('git actually ignores .env.local', () => {
    // `check-ignore` exits with 0 when the path is ignored (works even if the file does not exist).
    expect(() => git(['check-ignore', '-q', '--no-index', '.env.local'])).not.toThrow();
  });
});

describe('no remote code in src/', () => {
  const srcDir = fromRoot('src');
  const files = walkFiles(srcDir);

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [toPosixRelative(srcDir, file), file]))(
    'src/%s loads no remote scripts or modules',
    (_name, file) => {
      expect(findRemoteCodeLoads(readText(file))).toEqual([]);
    },
  );
});
