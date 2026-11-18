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
- Supported email languages: the rule checks cover en, de, fr, es, it, pt; the on-device AI
  answers in all six, with it and pt marked experimental (Chrome: "output quality cannot be
  guaranteed"; supported are de, en, es, fr, ja; measured 17 Nov 2026).
- Privacy is the core selling point: never send email content anywhere without explicit user
  consent.
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
- First hybrid prompt works from the side panel (PR #4): on-device with Gemini Nano, cloud via
  Firebase AI Logic. App Check uses a debug token (`VITE_APPCHECK_DEBUG_TOKEN` in `.env.local`),
  read **only in dev builds** (`npm run dev`); production builds have no App Check yet, so their
  cloud requests fail. The contest rules accept debug tokens in submissions.
- The side panel warms up the on-device model when it opens. Model load can take seconds or,
  in a long-running Chrome session, many minutes; a full Chrome exit fixed it. Inference on a
  loaded model takes about 1 s for short answers; one run took 39 s, cause unknown. On-device
  needs `expectedInputs` / `expectedOutputs` with languages, otherwise Chrome warns.
- `PREFER_ON_DEVICE` falls back to the cloud silently; consent before cloud is the 21 Nov task.
  Real emails go only to the on-device model (`InferenceMode.ONLY_ON_DEVICE`, decided 17 Nov
  2026); never to the cloud until the consent step exists. The hybrid test prompt is for test
  text only.
- AI check (`src/ai/`, `runAiCheck()` in `src/ai.ts`, `src/sidepanel/ai-view.ts`): every shown
  email goes on-device to Gemini Nano with a fixed system message (as `initialPrompts`, because
  the SDK does not pass `systemInstruction` on-device) and a JSON data block between random
  markers; the answer is constrained to `VERDICT_SCHEMA`, read strictly by `parseVerdict()`, and
  the rules are its lower limit. Details and limits: `docs/ai-check.md`.
- Result UI (`feat/result-ui`): the verdict is a traffic light above the details (`data-risk` on
  `#verdict`; grey "Checking…" until the AI answers if the rules found nothing). Links show the
  real domain, a shortened URL (`src/sidepanel/link-display.ts`) and a mark when a finding names
  them (`Finding.links`, set by the link and lookalike rules).
- Automatic scan: while the side panel is open, it keeps a port to the active tab
  (`src/sidepanel/watch.ts`, `src/messages.ts`); the content script (`src/content/gmail-watch.ts`)
  reports every opened email and loads its "Show original" page for the headers
  (`gmail-original.ts`), which the panel parses (`src/raw/gmail-original-page.ts`, sender checks
  only from `mx.google.com`). Closing the panel stops all reading. "Check the open email again"
  uses the same port. Gmail's selectors live in `SELECTORS` in
  `src/content/gmail-extract.ts` (measured 15 Nov 2026). If Gmail changes its page, measure
  again with a DevTools snippet that prints only counts and class names, never email content.
- "Or paste an email" in the side panel is the fallback when Gmail can't be read (and for the
  demo): the pasted text, plus the links from the clipboard's HTML (parsed with parse5, a runtime
  dependency since 16 Nov 2026), and four made-up sample emails (`src/paste/samples.ts`).
  Both paths show the email the same way.
- Rule checks (`src/rules/`, `checkEmail()`): pure functions, no DOM, no network. They flag
  dangerous links, link text vs real target (also behind forwarding parameters), lookalike
  domains, sender name vs address, pressure phrases (en/de/fr/es), invisible characters and
  mixed alphabets, and the side panel lists the findings. Registrable domains
  come from tldts (Public Suffix List, runtime dependency since 16 Nov 2026). `brands.ts` lists
  real brands as reference data only. Every rule is documented in
  `docs/rules.md`; keep it in sync when a rule changes.
- Raw emails (`src/raw/`): pasted raw source ("Show original", "View source") is recognized and
  parsed with postal-mime (runtime dependency since 16 Nov 2026, tight limits) into the email
  plus its headers. Header rules (`src/rules/headers.ts`) trust only the topmost
  `Authentication-Results` header. Raw headers hold the user's address and server IPs: never
  send them to the cloud. The fourth sample is raw source.
- Gmail internals for the automatic header loading (measured 16 Nov 2026, undocumented): "Show
  original" is `/mail/u/<n>/?ik=<ik>&view=om&permmsgid=msg-f:<decimal id>` and fails (404)
  without `ik`. `ik` (10 hex characters) is only in Gmail's inline scripts, as the 10th entry of
  `GLOBALS` (9 commas after `GLOBALS`), never in links. The open message `div.adn` has the ID in
  `data-message-id` and, as hex, in `data-legacy-message-id`. The page has exactly one `<pre>`
  with the raw email. A same-site fetch from the Gmail tab returns it (200, `text/html`). Measure
  again with a snippet that prints only counts and yes/no if it stops working.
- Automatic reading via the Gmail API was ruled out: `gmail.metadata` and `gmail.readonly` are
  restricted scopes, so every user would see Google's "unverified app" warning until a weeks-long
  verification.
- The GitHub repo is public (see "Privacy and contest rules").

## Timetable and workflow

- The full plan with dates is in **`TIMETABLE.md`**. Read it at the start of every session.
- Work only on the next open task(s) in `TIMETABLE.md`, unless I say otherwise.
- When a task is done and tested, tick it (`[x]`) in `TIMETABLE.md`.
- If a task takes much longer than planned or the schedule is at risk, tell me early and
  suggest what to cut. Feature freeze is Sun 22 Nov.
- Before implementing a task, briefly tell me your plan; keep changes small and follow the
  git workflow below.
- Check APIs in the installed types and sources in `node_modules`, not from memory.
- When something is slow or broken, measure first and find the cause before changing code.
- New dependencies: ask me first. Pin the exact version (`--save-exact`) and choose a release
  that is at least two weeks old; fresh releases are the usual window for supply-chain attacks.
  Prefer a version that is already in the lockfile.
- **At the end of every session, update `JOURNEY.md`** (rules at the top of that file): add what
  we did to today's daily-log entry, plus new challenges and learnings. Commit it in the
  session's branch, so it goes into the same PR. Never invent content for my personal sections.

## Git workflow (always)

- Never commit directly to `main`. Every feature or change gets its own branch from the latest
  `main`, e.g. `feat/hybrid-prompt`, `fix/side-panel-error`, `docs/readme`.
- Commit in small steps on that branch: one commit per logical step that builds
  (e.g. "Add rule check for lookalike domains", then "Show rule results in side panel"),
  not one big commit at the end. Run `npm run check` before each commit; it must pass. If the
  check fails, stop and fix it; never commit anyway.
- After each commit, check `git show --stat HEAD`: only the intended files, the right message.
- Push the branch and open a pull request into `main` (`gh pr create`). The PR description
  says what changed, why, how it was tested, and any known limits.
- Before asking me to merge, review the PR for bugs, security flaws, inconsistencies, best
  practice and things that can be simpler. Fix what you find, run the check, and review again
  until a round finds nothing new. Prove each code fix with a test that fails without it, where
  practical. Test what the tests cannot cover (e.g. side panel behaviour) in Chrome; if that was
  not possible, say so in the PR.
- PRs are merged with a **merge commit** only (`gh pr merge --merge`), never squash or rebase.
- Do not merge a PR without my OK. After the merge, switch back to `main`, pull, and delete
  the local branch (GitHub deletes the remote one).
- GitHub enforces this with the ruleset "Protect main": PR required, CI check `check` must pass,
  no force-push or deletion, merge commits only. GitHub deletes merged branches automatically.
- Never rewrite published history or force-push without my explicit OK.
- **Always commit with the GitHub noreply email**
  **`174874369+ricardo4raus@users.noreply.github.com`**, never my private email. It is set in
  this repo's git config; check `git config user.email` before the first commit of a session.
  GitHub blocks pushes that would expose the private email.
- On Windows, write commit messages and PR bodies to a file (`git commit -F`,
  `gh pr create --body-file`); PowerShell 5.1 breaks multi-line arguments that contain quotes.
- On Windows, run `npm` and Vitest in PowerShell, not Git Bash: Vitest fails in Git Bash because
  of the lowercase drive letter (`/c/…`).

## Checks

- `npm run check` runs everything in this order: `format:check` → `lint` (Oxlint) →
  `typecheck` (src + tests) → `build` → `test` (Vitest). CI runs the same command on every PR.
- Node version: see `.nvmrc` (CI uses it); `engines` requires Node `^24.15.0 || >=26.0.0`
  (jsdom's requirement).
- `npm run format` fixes formatting (Prettier).
- Linter is Oxlint, not ESLint, because typescript-eslint does not support TypeScript 7.
- `tests/` holds structure tests for the source, the manifest and the `dist` build output
  (e.g. no remote code). When adding a manifest permission, host permission or content-script
  match, update the allow-list in `tests/manifest.test.ts` on purpose.
- `npm run dev` overwrites `dist` with a dev build; run `npm run build` before `npm test`.
- If a `dist` test fails, find the pattern in the source; the minified names won't help.
- The remote-code check reads JavaScript with Vite's parser, HTML with parse5 and CSS with
  lightningcss. Never use regexes to parse HTML or CSS in a security check: every regex version
  had gaps that let a remote script or URL through.
- GitHub also runs CodeQL (default setup, on every PR and weekly), secret scanning with push
  protection, and Dependabot alerts with security updates. Treat a new alert like a failing
  test: check it, then fix it or dismiss it with a reason.

## Conventions (the tests enforce them)

- No remote code: no `<script src="https://…">`, no remote `import()`,
  no `script.src = 'https://…'`, no `eval`/`new Function`. External links (`<a href>`) and
  `fetch` to APIs are fine.
- Open external links with an `<a href>` or `chrome.tabs.create({ url })`.
- Gmail is read by a content script declared in `manifest.json` `content_scripts` with
  `matches: ['https://mail.google.com/*']`. Do not use crxjs `?script` injection (it exposes
  files to every site).
- Firebase App Check: use a `CustomProvider` with the debug token, never a reCAPTCHA provider
  (it loads remote scripts). Firebase Auth, if ever needed: only `firebase/auth/web-extension`.
- The App Check debug token is a secret: read it only behind `import.meta.env.DEV`, so release
  builds never contain it. The `dist` test fails if the token is in the build.
- No custom `content_security_policy` in the manifest; the MV3 default is what we want.
- Email content is attacker-controlled: show it only with `textContent`. `src/` must not turn
  strings into HTML (no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `srcdoc`,
  `createContextualFragment`, `setHTMLUnsafe`, `document.write`, `DOMParser`). Parse untrusted
  HTML with parse5 only: `DOMParser` can load `<img>` and `<iframe>` URLs (tracking pixels).
- Sample emails use made-up brands and `.example` domains only; a test rejects real brands.
- Read email HTML only through `readHtml()` (parse5 with a 1,000-level depth limit and a 2 MB
  limit), and walk parse5 trees without recursion: deep nesting crashed and froze the panel.
- Every email source cuts fields to `FIELD_LIMITS` (`src/email.ts`), and the validator rejects
  longer ones. Show email text in the panel through `setText()`, which reveals direction overrides.
- No invisible characters (zero-width, bidi controls) in `src/` or `tests/`: write escapes such
  as `\u200b` or `String.fromCodePoint(0x200b)`. Watch out: editing tools may turn `\u200b`
  in their input into the real character.
- Rule finding messages contain only limited email content (hostnames, our own phrases); raw
  attacker text (link texts, sender names) stays in `evidence`. In the AI prompt, pass evidence
  only as escaped data, and never let the AI lower a rule's danger finding (OWASP LLM01).

## Privacy and contest rules (mostly not enforced by tests)

- No personal data (PII), production API keys or project secrets in the repo, commits, PR texts,
  the submission form or testing instructions (contest rule). Keys belong in `.env.local`.
  Only API keys in tracked files are tested; the rest is up to us.
- The repo stays public with its license until the end of judging (16 Dec 2026).
- Never show DevTools in screenshots or the demo video: in dev builds the App Check SDK prints
  the debug token in the console.
- Before a demo: exit Chrome completely (also from the tray), then open the side panel once so
  the model is loaded.
