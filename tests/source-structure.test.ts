import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  fileExistsExactCase,
  findApiKeys,
  findHtmlSinks,
  findRemoteCodeInFile,
  fromRoot,
  parseEnv,
  readText,
  repoRoot,
  toPosixRelative,
  walkFiles,
} from './helpers';

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

/** Paths that must be git-ignored (checked with `git check-ignore`, so any pattern style works). */
const MUST_BE_IGNORED = ['dist/x', 'node_modules/x', '.env', '.env.local', '.env.production.local'];

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

// Git-based checks are skipped only outside a git checkout (e.g. a source zip) and never in CI: if
// git is broken there, they fail instead of silently passing.
const useGit = isGitWorkTree() || Boolean(process.env.CI);

describe('required files', () => {
  it.each(REQUIRED_FILES)('%s exists (exact case)', (file) => {
    expect(fileExistsExactCase(repoRoot, file), `${file} is missing`).toBe(true);
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
  const entries = parseEnv(readText(fromRoot('.env.example')));

  const keys = entries.map((entry) => entry.key);

  // Extra keys are fine (e.g. VITE_APPCHECK_DEBUG_TOKEN): .env.example is the template for
  // .env.local and grows with the project. The Firebase config keys must all be there, though.
  it('has every Firebase config key', () => {
    expect(FIREBASE_ENV_KEYS.filter((key) => !keys.includes(key))).toEqual([]);
  });

  it('has no duplicate keys', () => {
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([]);
  });

  it('has only empty values (never commit real config here)', () => {
    const nonEmpty = entries.filter((entry) => entry.value !== '').map((entry) => entry.key);
    expect(nonEmpty, 'these keys must be written as KEY= with an empty value').toEqual([]);
  });
});

/** Whether git ignores `path`. */
function isIgnored(path: string): boolean {
  // Exit code 0 = ignored, 1 = not ignored (works even if the file does not exist). --no-index:
  // decide by the ignore rules only, even if the file is (wrongly) tracked; tracking is tested
  // below. Any other failure (git missing in CI, exit 128) is rethrown and fails the test.
  try {
    git(['check-ignore', '-q', '--no-index', path]);
    return true;
  } catch (error) {
    if ((error as { status?: number }).status === 1) return false;
    throw error;
  }
}

describe.skipIf(!useGit)('.gitignore', () => {
  it.each(MUST_BE_IGNORED)('ignores %s', (path) => {
    expect(isIgnored(path), `${path} is not ignored – add it to .gitignore`).toBe(true);
  });
});

describe.skipIf(!useGit)('git tracking of secrets', () => {
  const tracked = useGit ? git(['ls-files', '-z']).split('\0').filter(Boolean) : [];

  it('does not track .env.local or any other .env file except .env.example', () => {
    const envFiles = tracked.filter(
      (file) => /(^|\/)\.env(\..*)?$/.test(file) && !file.endsWith('.env.example'),
    );
    expect(envFiles, 'remove with: git rm --cached <file>').toEqual([]);
  });

  it('no tracked file contains a Google/Firebase API key (real keys belong in .env.local)', () => {
    const problems = tracked
      .filter((file) => existsSync(fromRoot(file)))
      .flatMap((file) => findApiKeys(readText(fromRoot(file))).map((hit) => `${file} ${hit}`));
    expect(problems).toEqual([]);
  });
});

describe('no remote code in src/', () => {
  const srcDir = fromRoot('src');
  const files = walkFiles(srcDir);

  it('has source files to check', () => {
    expect(files.length, 'src/ is missing or empty').toBeGreaterThan(0);
  });

  it.each(files.map((file) => [toPosixRelative(srcDir, file), file]))(
    'src/%s loads no remote scripts or modules',
    (name, file) => {
      expect(findRemoteCodeInFile(name, readText(file))).toEqual([]);
    },
  );
});

describe('no HTML injection sinks in src/', () => {
  const srcDir = fromRoot('src');
  const scripts = walkFiles(srcDir).filter((file) => /\.[cm]?tsx?$/.test(file));

  // Email content is attacker-controlled: show it with textContent, parse it with parse5.
  it.each(scripts.map((file) => [toPosixRelative(srcDir, file), file]))(
    'src/%s turns no strings into HTML',
    (name, file) => {
      expect(findHtmlSinks(readText(file), name)).toEqual([]);
    },
  );
});

describe('no invisible characters in the source', () => {
  // Invisible format characters (zero-width, bidi controls) can hide code or text from reviewers
  // ("Trojan Source"). Tests that need them write escapes such as \u200b.
  const files = [
    ...walkFiles(fromRoot('src')),
    ...walkFiles(fromRoot('tests')),
    ...walkFiles(fromRoot('docs')),
    ...['manifest.json', 'CLAUDE.md', 'JOURNEY.md', 'TIMETABLE.md', 'README.md'].map((file) =>
      fromRoot(file),
    ),
  ].filter((file) => /\.(?:[cm]?tsx?|html|css|json|md)$/.test(file));

  it.each(files.map((file) => [toPosixRelative(repoRoot, file), file]))(
    '%s has no invisible characters',
    (_name, file) => {
      expect(readText(file)).not.toMatch(/\p{Cf}/u);
    },
  );
});
