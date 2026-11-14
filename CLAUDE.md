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

## Product concept (what makes PhishLocal different)

1. **On-device by default**: Gemini Nano checks the email in Chrome. Nothing leaves the device.
2. **Privacy filter in front of the cloud**: a cloud "deep check" happens only with explicit
   consent. Before sending, the on-device step removes personal data (names, email addresses,
   phone numbers, IBANs) and shows the user exactly what will be sent.
3. **Explains every red flag** instead of only "dangerous": e.g. "link text says paypal.com but
   goes to paypa1-secure.com", "creates time pressure".
4. **Multilingual**: en, de, fr, es on-device. Other languages (e.g. Italian) go to the cloud,
   after local clean-up.
5. Rule checks (plain TypeScript) + AI together: rule results are fed into the prompt.

## Current status

- Project setup done (commit "Project setup"); side panel opens in Chrome.
- Firebase project `phishlocal` exists, AI Logic enabled with Gemini Developer API.
- **App Check is enforced but still "Unregistered"** → cloud requests will fail until we add an
  App Check debug token for development. Handle this when adding the first hybrid prompt.
- Gemini Nano works on the dev machine (Chrome 157, multilingual flag enabled).
  First prompt after a cold start can take minutes; warm prompts take ~1 s.
  On-device needs `expectedInputs` / `expectedOutputs` with languages, otherwise Chrome warns.

## Timetable and workflow

- The full plan with dates is in **`TIMETABLE.md`**. Read it at the start of every session.
- Work only on the next open task(s) in `TIMETABLE.md`, unless I say otherwise.
- When a task is done and tested, tick it (`[x]`) in `TIMETABLE.md`.
- If a task takes much longer than planned or the schedule is at risk, tell me early and
  suggest what to cut. Feature freeze is Sun 22 Nov.
- Before implementing a task, briefly tell me your plan; keep changes small and follow the
  git workflow below.

## Git workflow (always)

- Never commit directly to `main`. Every feature or change gets its own branch from the latest
  `main`, e.g. `feat/hybrid-prompt`, `fix/side-panel-error`, `docs/readme`.
- Commit in small steps on that branch: one commit per logical step that builds
  (e.g. "Add rule check for lookalike domains", then "Show rule results in side panel"),
  not one big commit at the end. Run `npm run check` before each commit; it must pass.
- Push the branch and open a pull request into `main` (`gh pr create`).
- PRs are merged with a **merge commit** only (`gh pr merge --merge`), never squash or rebase.
- Do not merge a PR without my OK. After the merge, switch back to `main`, pull, and delete
  the branch.

## Checks

- `npm run check` runs everything in this order: `format:check` → `lint` (Oxlint) →
  `typecheck` (src + tests) → `build` → `test` (Vitest). CI runs the same command on every PR.
- Node version: see `.nvmrc` (CI uses it); `engines` requires Node >= 24.12.
- `npm run format` fixes formatting (Prettier).
- Linter is Oxlint, not ESLint, because typescript-eslint does not support TypeScript 7.
- `tests/` holds structure tests for the source, the manifest and the `dist` build output
  (e.g. no remote code). When adding a manifest permission, host permission or content-script
  match, update the allow-list in `tests/manifest.test.ts` on purpose.
- `npm run dev` overwrites `dist` with a dev build; run `npm run build` before `npm test`.
- If a `dist` test fails, find the pattern in the source; the minified names won't help.

## Conventions (the tests enforce them)

- No remote code: no `<script src="https://…">`, no remote `import()`, no `script.src = 'https://…'`,
  no `eval`/`new Function`. External links (`<a href>`) and `fetch` to APIs are fine.
- Open external links with an `<a href>` or `chrome.tabs.create({ url })`.
- Gmail is read by a content script declared in `manifest.json` `content_scripts` with
  `matches: ['https://mail.google.com/*']`. Do not use crxjs `?script` injection (it exposes
  files to every site).
- Firebase App Check: use a `CustomProvider` with the debug token, never a reCAPTCHA provider
  (it loads remote scripts). Firebase Auth, if ever needed: only `firebase/auth/web-extension`.
- No custom `content_security_policy` in the manifest; the MV3 default is what we want.
