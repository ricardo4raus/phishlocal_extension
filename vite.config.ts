import { defineConfig, loadEnv } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

/** Build mode of the judges build; see `src/firebase.ts`. */
export const JUDGES_MODE = 'judges';

/** Where the judges build goes: never into dist/, which the tests check for secrets. */
export const JUDGES_OUT_DIR = 'dist-judges';

export default defineConfig(({ mode }) => {
  if (mode === JUDGES_MODE) {
    const env = loadEnv(mode, process.cwd(), 'VITE_APPCHECK_');
    const token = env.VITE_APPCHECK_JUDGES_TOKEN?.trim();
    // A judges build without its token would silently lack the deep check.
    if (!token) {
      throw new Error('Judges build: set VITE_APPCHECK_JUDGES_TOKEN in .env.judges.local.');
    }
    // The judges' token is revoked after judging; the developer's own token must not go out.
    if (token === env.VITE_APPCHECK_DEBUG_TOKEN?.trim()) {
      throw new Error('Judges build: VITE_APPCHECK_JUDGES_TOKEN must be its own token.');
    }
  }
  return {
    plugins: [crx({ manifest })],
    build: {
      outDir: mode === JUDGES_MODE ? JUDGES_OUT_DIR : 'dist',
      // Pages that manifest.json does not name: the welcome page (src/welcome/open.ts).
      rollupOptions: { input: { welcome: 'src/welcome/index.html' } },
    },
  };
});
