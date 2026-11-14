# PhishLocal – Project brief for Claude Code

## What this project is
PhishLocal is a Chrome extension (Manifest V3) for the Firebase #BuildHybridAI hackathon
(Devpost, deadline Mon 30 Nov 2026, 23:00 Swiss time).

It checks emails for phishing **on-device** with Gemini Nano (Chrome Prompt API) through the
**Firebase AI Logic hybrid inference SDK** (`firebase/ai`, `InferenceMode.PREFER_ON_DEVICE`),
and falls back to the cloud (Gemini Developer API) only when needed.

Pitch: "Your emails never leave your browser. PhishLocal uses on-device AI to spot phishing,
explain every red flag, and work offline, with a cloud only as fallback."

## Fixed decisions (do not change without asking)
- Chrome extension, Manifest V3, UI in a **side panel**.
- Build: **Vite + TypeScript**. Prefer `@crxjs/vite-plugin` for the extension build.
  If it does not work with the current Vite version, use a plain Vite multi-entry build instead
  and explain why.
- **No remote code**: everything (including the Firebase SDK) must be bundled into the extension.
  No `<script src="https://...">`, no CDN imports.
- Firebase is installed via **npm** (`firebase` package), not via script tags.
- Firebase config comes from `.env.local` (`VITE_FIREBASE_*` variables). `.env.local` is
  git-ignored; `.env.example` with empty values is committed.
- License: **Apache-2.0** (hackathon requirement: public repo with visible open-source license).
- Supported email languages on-device: en, de, fr, es.
- Privacy is the core selling point: never send email content anywhere without explicit user consent.
- Keep it simple. No frameworks (React etc.) unless I ask. Plain TypeScript + HTML + CSS.

## CURRENT TASK: project setup only
Only create the prerequisites so development can start immediately later.
**Do NOT implement any features** (no Gmail reading, no AI calls, no phishing logic, no UI design).

1. Check that Node.js (>= 20) and npm are installed; tell me if not.
2. `git init` and create `.gitignore` (node_modules, dist, .env.local, .vite, *.log).
3. `npm init` + install:
   - dependencies: `firebase`
   - devDependencies: `vite`, `typescript`, `@crxjs/vite-plugin`, `@types/chrome`
4. Create `tsconfig.json` and `vite.config.ts`.
5. Create `manifest.json` (MV3):
   - name "PhishLocal", version "0.1.0", short description
   - `side_panel.default_path` → the side panel HTML
   - permissions: `["sidePanel"]` only (more will be added later)
   - background service worker
6. Create minimal files:
   - `src/sidepanel/index.html` + `src/sidepanel/main.ts` → only shows the text "PhishLocal – setup OK"
   - `src/background.ts` → only `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
     so clicking the extension icon opens the side panel
   - `src/firebase.ts` → only `initializeApp(...)` with the config read from `import.meta.env`.
     No AI calls yet.
7. Create `.env.example` with these empty keys:
   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
   VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID
8. Create `LICENSE` (full Apache-2.0 text, copyright 2026 Ricardo Kraus) and a short `README.md`
   (name, one-line description, "work in progress").
9. Add npm scripts: `dev`, `build`.
10. Run `npm run build` and make sure it succeeds.
11. Make a first git commit: "Project setup".
12. At the end, tell me in short steps:
    - where to paste my Firebase config (`.env.local`)
    - how to load the `dist` folder in `chrome://extensions` (Developer mode → Load unpacked)
    - how to check that the side panel opens

Stop after this. Do not start with features.
