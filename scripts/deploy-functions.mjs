// Deploys the token server (functions/) and the Firestore rules to the Firebase project named in
// .env.local. Run `npm run firebase:login` once before. Usage: npm run deploy:functions
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** The pinned Firebase CLI (released 4 Nov 2026), run through npx; not a project dependency. */
const FIREBASE_TOOLS = 'firebase-tools@15.35.0';

function readEnv(file) {
  const values = new Map();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values.set(match[1], match[2].replace(/^(['"])(.*)\1$/, '$2'));
  }
  return values;
}

function run(command, args) {
  // npm and npx are .cmd files on Windows, which only start through a shell (as one command
  // line); every argument is fixed or checked before use, so the shell sees no outside input.
  const result =
    process.platform === 'win32'
      ? spawnSync([command, ...args].join(' '), { stdio: 'inherit', shell: true })
      : spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const env = readEnv('.env.local');
const projectId = env.get('VITE_FIREBASE_PROJECT_ID') ?? '';
const appId = env.get('VITE_FIREBASE_APP_ID') ?? '';
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
  console.error('VITE_FIREBASE_PROJECT_ID in .env.local is missing or not a project ID.');
  process.exit(1);
}
if (!/^1:\d+:web:[0-9a-f]+$/.test(appId)) {
  console.error('VITE_FIREBASE_APP_ID in .env.local is missing or not a web app ID.');
  process.exit(1);
}

// The function reads the web app ID from functions/.env (git-ignored), which the CLI uploads.
writeFileSync('functions/.env', `WEB_APP_ID=${appId}\n`);
run('npm', ['ci', '--prefix', 'functions', '--ignore-scripts']);
run('npm', ['run', 'build:functions']);
run('npx', [
  '--yes',
  FIREBASE_TOOLS,
  'deploy',
  '--only',
  'functions,firestore:rules',
  '--project',
  projectId,
]);
