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
- Languages: the rule checks cover emails in en, de, fr, es, it, pt. The panel and the AI's
  answers come in en, de, fr, es, it, pt (decided 22 Nov 2026): "Automatic" (Chrome's language,
  else English) until the user picks one with the flag button (decided 23 Nov 2026, PR #37) or under
  Settings (the only way back to "Automatic"); the choice is kept in the panel's
  local storage and switching reloads the panel. Whatever the email's language, the AI answers
  in the panel's language. Text lives in `src/i18n/` (`en.ts` is the master copy; TypeScript and
  `tests/i18n.test.ts` keep the others complete); `index.html` marks its text with `data-t`.
  On-device answers in it and pt are experimental (Chrome: "output quality cannot be
  guaranteed"; supported are de, en, es, fr, ja; measured 17 Nov 2026), and the panel says so.
  No translation has been checked by a native speaker yet. English on purpose: dev-only parts
  (developer tools, sample labels), the rules' own messages (the prompt and the English panel
  use them; other languages show the dictionary's sentence per rule), and an SDK's own error
  message in tier 3 (our engine reasons go through `localDetail()`).
- Privacy is the core selling point: never send email content anywhere without explicit user
  consent.
- Keep it simple. No frameworks (React etc.) unless I ask. Plain TypeScript + HTML + CSS.

## Product concept (what makes PhishLocal different)

1. **On-device by default**: Gemini Nano checks the email in Chrome. Nothing leaves the device.
2. **Privacy filter in front of the cloud**: a cloud "deep check" happens only with explicit
   consent. Before sending, the on-device step removes personal data and shows the user exactly
   what will be sent. A privacy level, chosen in the panel (decided 22 Nov 2026), sets how much:
   "Standard" (default) removes email addresses, phone and other long numbers, IBANs and link
   paths; "High" also removes the names of people (Gemini Nano and greetings). Standard keeps
   names because removing them also hit brands, and the cloud can then tell a mass email from one
   written for the recipient.
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
  read **only in dev builds** (`npm run dev`). Since 22 Nov 2026 other builds get App Check
  tokens from the token server (`functions/`, a callable Cloud Function in `europe-west6`;
  client `src/token-server.ts`): anonymous Firebase Auth on a second Firebase app (Auth on the
  main app would ask App Check, which asks the server: a loop), 30-minute tokens, daily limits
  per user, per IP address (HMAC only) and for everyone in Firestore. The limits count tokens,
  not requests: the Gemini API spend cap (5 CHF a month) and the Gemini prepaid credit cap the
  cost. Deployed and tested in Chrome on 22 Nov 2026 (project on Blaze since then; with billing
  linked, the Gemini Developer API needs prepaid credits from AI Studio). Deploy with `npm run deploy:functions`; setup steps in
  the README. The contest rules accept debug tokens in submissions.
- The side panel warms up the on-device model when it opens. Model load can take seconds or
  many minutes (see the measurements below). Inference on a
  loaded model takes about 1 s for short answers; one run took 39 s, cause unknown. On-device
  needs `expectedInputs` / `expectedOutputs` with languages, otherwise Chrome warns.
- Measured 19 Nov 2026: the first model load after a full Chrome exit took 304.8 s on the dev
  machine (3.8 s on 15 Nov); afterwards sessions with any settings start in 0.0–0.1 s. Chrome can
  unload the model while the panel is open (a later session once took 249 s). So the panel opens
  a session right before each check (`ensureModelLoaded()` in `src/ai.ts`), outside the check's
  time limit. The load time itself is Chrome's and cannot be guaranteed by the extension.
- Measured 21–22 Nov 2026 on the dev machine: after Chrome restarts, loads took 125–537 s, and
  Chrome sat idle the whole time (no CPU, no GPU, no RAM growth; verbose log silent between the
  request and the ready model). Ruled out: our code, RAM, disk, CPU, crash backoff
  (`model_crash_count` 0, performance class 6), the empty GPU cache files, and Chrome still
  running in the background. The first Chrome start after a PC restart loaded in 14.1 s; the next
  Chrome restart took 125 s again. Cause found the same night: the weights load in 2.5 s; the
  minutes are the first prefill, where the NVIDIA D3D12 driver blocks 1–7 s for about 80 of the
  334 GPU compute pipelines Chrome's ML library creates for every new service process (outside
  the extension; machine or driver specific until measured elsewhere). Full record, with the
  measuring methods: `docs/model-load-debugging.md`.
- `PREFER_ON_DEVICE` falls back to the cloud silently, so the hybrid test prompt is for test
  text only. Real emails go to the on-device model (`InferenceMode.ONLY_ON_DEVICE`, decided 17 Nov
  2026), and to the cloud only through the deep check (21 Nov 2026,
  `src/sidepanel/deep-check-view.ts`): on request (and at privacy level High only), Nano finds
  names on the device (`findNames()`), `cloudData()` in `src/privacy/redact.ts` builds the cleaned
  data, the panel shows what was removed and, one click away ("Show what will be sent"), exactly
  that JSON (decided 22 Nov 2026), and only "Send to the cloud" sends it (`runCloudCheck()`),
  once per consent. Never send anything else from an email to the cloud, and
  never raw headers. Details: `docs/ai-check.md`.
- AI check (`src/ai/`, `runAiCheck()` in `src/ai.ts`, `src/sidepanel/ai-view.ts`): every shown
  email goes on-device to Gemini Nano with a fixed system message (as `initialPrompts`, because
  the SDK does not pass `systemInstruction` on-device) and a JSON data block between random
  markers; the answer is constrained to `VERDICT_SCHEMA`, read strictly by `parseVerdict()`, and
  the rules are its lower limit. Details and limits: `docs/ai-check.md`.
- Result UI (rebuilt 22 Nov 2026, PRs #22 to #27, spec `docs/ui-design.md`): the verdict band
  (`data-risk` on `#verdict`: `pending`, `safe`, `suspicious`, `dangerous`, `unchecked`) shows a
  word, one hedged line, the AI's reasons, the advice and a footer ("Checked on this device" or
  "Basic checks only"). Grey "Checking…" until the AI answers; grey "No red flags found / Not
  checked by AI" when the AI gave no answer: never green without an AI answer. Red flags are rows
  with a plain-word title per rule (`TITLES` in `src/sidepanel/findings-view.ts`), links show the
  real domain, a shortened URL (`src/sidepanel/link-display.ts`) and a badge when a finding names
  them (`Finding.links`); `info` findings are notes in "Email details". Tier-1 and tier-2 text
  never says "rule", "SPF", "DKIM" or "DMARC".
- AI check runs are stoppable: `runAiCheck()` sets an `AbortSignal` on the check model's option
  objects, which the SDK passes to Chrome by reference (tested through the SDK's browser build in
  `tests/ai/sdk-on-device.test.ts`). The panel stops a run on timeout and when its email is left.
  The SDK silently uses the cloud for `ONLY_ON_DEVICE` when `LanguageModel` is missing; keep the
  guard in `runAiCheck()`. Tests must never reach the network (that test stubs `fetch`).
- Automatic scan: while the side panel is open, it keeps a port to the active tab
  (`src/sidepanel/watch.ts`, `src/messages.ts`); the content script (`src/content/gmail-watch.ts`)
  reports every opened email and loads its "Show original" page for the headers
  (`gmail-original.ts`), which the panel parses (`src/raw/gmail-original-page.ts`, sender checks
  only from `mx.google.com`). Closing the panel stops all reading. "Check the open email again"
  uses the same port. After an install or update, `src/inject.ts` injects the manifest's content
  script into open Gmail tabs (`scripting` + Gmail host permission, added 18 Nov 2026), because
  Chrome injects manifest content scripts only on new page loads. Gmail's selectors live in
  `SELECTORS` in
  `src/content/gmail-extract.ts` (measured 15 Nov 2026). If Gmail changes its page, measure
  again with a DevTools snippet that prints only counts and class names, never email content.
- "Check another email" (a fold; "Paste an email" on the empty state opens it) is the fallback
  when Gmail can't be read (and for the demo): the pasted text, plus the links from the
  clipboard's HTML (parsed with parse5, a runtime dependency since 16 Nov 2026), and five made-up
  sample emails (`src/paste/samples.ts`), shown in dev and judges builds only. The test prompt
  ("Developer tools") shows in dev builds only. Both paths show the email the same way.
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
- Remote Config (22 Nov 2026, `src/settings.ts`, `src/remote-config.ts`): cloud model
  (allow-list), three time limits and `extra_instructions` (added after the fixed system messages,
  never replacing them). Every value is checked by `readSettings()` and falls back to its default.
  The panel loads them once when it opens (at most 2 s) and calls `configureAi()` before any
  model session. The prompt's security rules must never become a Remote Config value.
- UI design (22 Nov 2026): `docs/ui-design.md` is the spec for the side panel (principles,
  state table, components, wording, rule titles, tokens, CSS architecture, decisions) and the
  code follows it since PRs #22 to #27. Read it before any side panel UI work: new text must
  fit its tiers ("Overview first", "Plain words", "True claims only"), new CSS its layers and
  component rules (no outer margins, no styling across components, tokens only). Icons are SVG
  files shown through CSS masks: the panel's DOM holds no `<svg>`, `<a>` or `<img>` (the monkey
  test checks that). To look at a state without loading the extension, fill the page's HTML in
  a scratch file and screenshot it with headless Chrome at 380 px (`--force-device-scale-factor=1`,
  its window is at least 500 px wide).
- Welcome page (23 Nov 2026, PR #36, `src/welcome/`, spec in `docs/ui-design.md`): opened once in a tab
  after the first install (`openWelcome()`, never after updates), with the big logo, how to
  start and the privacy points. It reuses the panel's stylesheet and language; its own texts are
  the `welcome` section of each dictionary. Not in the manifest: Vite builds it as an extra
  input (`vite.config.ts`).
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
- Monkey tests (`tests/monkey/`, added 19 Nov 2026): random hostile input for the parsers, rules,
  AI answer reader and the privacy filter (planted personal data must not reach the cloud data),
  and random event orders for the AI check and the whole side panel
  (`main.ts` with fake Chrome and model). CI runs a fixed seed. Before a PR that touches parsing,
  the AI check or the panel, also run them with a random seed and 100 times the cases
  (`MONKEY_SEED=random`, `MONKEY_RUNS=100`; command in the README). A failure names
  `MONKEY_SEED` and `MONKEY_CASE` to replay it. A new panel promise belongs in their checks; a
  new move (button, message type) in their move lists.
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
- Firebase App Check: use a `CustomProvider` (debug token or the token server), never a
  reCAPTCHA provider (it loads remote scripts). Firebase Auth: only `firebase/auth/web-extension`,
  and only on the separate sign-in app in `src/firebase.ts`, never on the app with App Check.
  The token request carries no email content; keep it after the user's click on Send.
- The App Check debug token is a secret: read it only behind `import.meta.env.DEV`, so release
  builds never contain it. The `dist` test fails if the token is in the build. The judges build
  (`npm run build:judges`, mode `judges`, output `dist-judges/`, decided 22 Nov 2026) reads a
  separate judges' token (`VITE_APPCHECK_JUDGES_TOKEN` in `.env.judges.local`) behind
  `MODE === 'judges'`; never ship `dist-judges/` publicly (Devpost links and files are public;
  the token passes App Check for the whole project), and revoke that token after judging.
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
- Before a demo: restart the PC, start Chrome once, then open the side panel once so the model is
  loaded (measured 22 Nov 2026: 14.1 s after a PC restart, minutes after a Chrome restart).
