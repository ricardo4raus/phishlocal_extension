import { defineConfig, loadEnv } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

/** Build mode of the judges build; see `src/firebase.ts`. */
export const JUDGES_MODE = 'judges';

/** Where the judges build goes: never into dist/, which the tests check for secrets. */
export const JUDGES_OUT_DIR = 'dist-judges';

export default defineConfig(({ mode }) => {
  if (mode === JUDGES_MODE) {
    // A judges build without its token would silently lack the deep check.
    const token = loadEnv(
      mode,
      process.cwd(),
      'VITE_APPCHECK_JUDGES_TOKEN',
    ).VITE_APPCHECK_JUDGES_TOKEN;
    if (!token?.trim()) {
      throw new Error('Judges build: set VITE_APPCHECK_JUDGES_TOKEN in .env.judges.local.');
    }
  }
  return {
    plugins: [crx({ manifest })],
    build: { outDir: mode === JUDGES_MODE ? JUDGES_OUT_DIR : 'dist' },
  };
});
