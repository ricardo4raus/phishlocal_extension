# PhishLocal – Project journey

A running record of how PhishLocal was built: why, how, what went wrong and what we learned.
It is the raw material for the Devpost story and the demo video.

## How to update this file

- Update it at the end of **every** work session, in the same branch and PR as the session's work.
- Add what happened to the day's entry in the **Daily log** (create the entry if it is missing).
  Newest day at the bottom. Short bullet points; facts, not marketing.
- Add notable problems to **Challenges** and new insights to **What we learned**.
- Update **What it does** when a feature is finished.
- Sections marked _To fill in by Ricardo_ are personal; don't invent content for them.

## Inspiration

_Draft based on Ricardo's planning notes. Ricardo: review, and add your own experiences with phishing._

- I was looking for real problems that people have and that an app could solve, and came across
  the Firebase #BuildHybridAI hackathon.
- I'm an IT apprentice (application development) in Zurich and work mostly in IT security, where
  phishing is one of the most common threats. A phishing checker was a natural fit.
- Most phishing checkers send your email or its links to a server. But email is private: sending
  every email to a cloud AI to check it defeats the purpose. Chrome now ships Gemini Nano
  on-device, and Firebase AI Logic can run a prompt on-device first and use the cloud only as a
  fallback.
- Switzerland is multilingual, so a checker that only understands English is not enough.
- The goal: a tool that shows instantly that you can check for phishing securely, offline and
  without sharing your data. That's where the name PhishLocal comes from.

## What it does

_Current state, updated as features land._

- Chrome extension (Manifest V3) with a side panel. Clicking the toolbar icon opens it.
- The side panel sends a test prompt through Firebase AI Logic hybrid inference
  (`InferenceMode.PREFER_ON_DEVICE`): Gemini Nano answers on-device; the cloud is the fallback.
  The panel shows where the prompt ran and how long it took.
- When the side panel opens, it loads the on-device model in the background and shows its state
  (loading, ready, not downloaded, not available).
- No check of real emails yet.

## How we built it

- **Stack:** Chrome Manifest V3, Vite 8, TypeScript 7, `@crxjs/vite-plugin`, Firebase JS SDK
  (`firebase/ai` hybrid inference with `InferenceMode.PREFER_ON_DEVICE`), plain HTML and CSS.
- **AI pair programming:** built with Claude Code. Each task starts with a short plan, then
  small commits on a feature branch, a pull request and a merge commit after review.
- **Quality checks:** Prettier, Oxlint, a TypeScript type check, Vitest structure tests and
  GitHub Actions CI. One command, `npm run check`, runs everything locally and in CI.
- **Privacy guarded by tests:** the tests fail if the build loads remote code, the manifest asks
  for more permissions than allowed, or an API key ends up in a committed file. JavaScript is
  checked on the syntax tree (Vite's parser), HTML with a standard-conformant parser (parse5),
  CSS with lightningcss (the CSS parser Vite uses).
- **GitHub security tools:** a ruleset protects `main` (pull request and passing CI required, no
  force-push). CodeQL scans the code on every pull request, secret scanning blocks pushes that
  contain known secret formats, and Dependabot reports vulnerable packages.

## Challenges

- **Linting TypeScript 7:** typescript-eslint supports only TypeScript < 6.1. We used Oxlint
  instead of downgrading TypeScript.
- **"No remote code" is hard to check:** a first, regex-based check missed runtime script
  loading and flagged harmless strings such as phishing samples. It was rewritten to walk the
  syntax tree (Vite's `parseSync`), then tested against realistic future code.
- **Firebase in an extension:** the browser builds of Firebase Auth and the reCAPTCHA App Check
  provider load scripts from Google servers, which MV3 does not allow. Use
  `firebase/auth/web-extension` and an App Check `CustomProvider` with a debug token.
- **Outdated setup guides:** most guides list two Chrome flags, but in Chrome 157
  `#optimization-guide-on-device-model` no longer exists; only `#prompt-api-for-gemini-nano` is
  needed. `chrome://on-device-internals` is disabled by default and has to be enabled via
  `chrome://chrome-urls`.
- **The first prompt seemed to hang:** right after the model download, the first prompt took about
  4 minutes with no output, which looked like a failure. It was only the one-time warm-up.
- **Windows tooling:** Node 25 (non-LTS, end of life) blocked Vitest 5; PowerShell's execution
  policy blocked `npm.ps1` after reinstalling Node; Vitest fails in Git Bash when the drive
  letter is lowercase (`/c/...`).
- **A secret that the bundler wants to publish:** the App Check debug token must reach the code,
  but Vite copies every `VITE_*` value into the bundle. The code reads the token only in dev
  builds (`import.meta.env.DEV`), and a test fails if a production build contains it.
- **The cloud path could not be tested:** with Gemini Nano available, `PREFER_ON_DEVICE` never
  uses the cloud. A development-only "Force cloud" switch (`ONLY_IN_CLOUD`) made App Check
  testable.
- **On-device was far too slow from the side panel:** the same short prompt took 314 s on the
  first run and 646 s on the second; the cloud took 1.6 s. A timing test in the DevTools console
  split it up: `LanguageModel.create()` took 572 s, every prompt and every later session took
  0.1–0.3 s. So loading the model into memory was the problem, not inference. A first theory
  (Chrome's GPU program cache files were empty) turned out wrong: after a full Chrome exit,
  including background processes, the model loaded in 3.8 s with the cache files still empty.
  The exact cause is unknown; the long-running Chrome session was probably in a bad state.

## What we learned

- Gemini Nano in Chrome: the first prompt after a cold start can take minutes; warm prompts take
  about 1 s. On-device prompts need `expectedInputs` / `expectedOutputs` with languages.
- Vite copies every `VITE_*` variable into the built JavaScript. Anything in `.env.local` that
  the code uses is public in the extension, so secrets (e.g. an App Check debug token) must
  never ship in a release build.
- The Firebase web API key is not a secret; App Check and API key restrictions protect the
  project.
- crxjs `?script` injection makes extension files reachable from every website. A content script
  declared in the manifest with a narrow `matches` avoids that.
- Pinning GitHub Actions to commit SHAs protects CI from moved tags; Dependabot keeps them
  current.
- Use LTS (even-numbered) Node versions; odd versions reach end of life after a few months.
- Firebase App Check and AI Logic: `initializeAppCheck()` must run before `getAI()`, because the
  AI instance looks up App Check only once, when it is created.
- App Check debug mode: the SDK reads the global `FIREBASE_APPCHECK_DEBUG_TOKEN` and exchanges
  the token itself. The `CustomProvider` is required but its `getToken()` is never called. The
  debug token works even though the web app is shown as "Unregistered" in the console.
- If only `CustomProvider` is imported, the bundler removes the reCAPTCHA script loader from the
  App Check SDK, so the build stays free of remote code.
- `PREFER_ON_DEVICE` falls back to the cloud only when the on-device model is not available, and
  it does so silently. For real emails that needs a design with explicit consent.
- On-device timing has two parts: loading the model into memory (seconds, but minutes in a bad
  state) and inference (about 1 s). While one session stays open, Chrome keeps the model loaded
  and new sessions start in 0.1 s. The SDK creates a new session for every prompt, so an
  extra session kept open by the side panel works as a warm-up.
- Measure before fixing: a 6-line timing script showed where the time went, and a check of the
  cache files disproved our own theory.
- Before a demo: exit Chrome completely (also from the tray) and open the side panel once.
- Set the GitHub noreply email before the first commit. Rewriting history later cleans `main`,
  but GitHub keeps the old commits of every pull request reachable (`refs/pull/N/head`), and a
  force-push cannot change those.
- In debug mode the App Check SDK prints the debug token in the DevTools console. Never show
  DevTools in screenshots or the demo video.
- A security test needs a negative test: planting a fake token showed that the leak test works,
  and also that Windows PowerShell 5.1 writes UTF-8 files with a BOM that `.env` parsers do not
  read.
- Read the installed SDK types instead of trusting memory: the hybrid API and the default cloud
  model (`gemini-3.5-flash-lite`) were taken from `node_modules`.
- Don't parse HTML or CSS with regexes in a security check. Each regex fix for the remote-code
  test left the next trick open: in HTML comments (`<!-->`), fake opening tags, quotes in
  unquoted values and character references (`https&#58;//`); in CSS escapes (`u\72l(`), `/*`
  inside strings and `image-set("…")`. Real parsers (parse5 for HTML, lightningcss for CSS) see
  what the browser sees and closed all of them at once. CodeQL's usual fix (repeat the removal
  until nothing changes) would have made it worse.
- Repeated reviews pay off: the first fix for the CodeQL alert opened a new gap, the second one
  too; only the third review led to the real fix.
- Pin new dependencies to a release that is a few weeks old (here parse5 8.0.1 instead of the
  8-day-old 8.1.1): fresh releases are the usual window for supply-chain attacks. lightningcss is
  pinned to the version Vite already uses, so nothing new is downloaded.
- A security alert needs context: Dependabot flagged `@grpc/grpc-js`, but it is only used by
  Firestore's Node build, which we neither use nor bundle.

## Accomplishments we're proud of

_To fill in as the project progresses._

- Go/no-go passed on day 1: Gemini Nano runs on the dev machine, warm prompts answer in about 1 s.
- First hybrid prompt: the same phishing sample was answered on-device and in the cloud, and both
  flagged the lookalike domain.

## What's next

_To fill in near the submission._

## Daily log

### Sat 14 Nov 2026

**Before coding (Ricardo):**

- Looked for app ideas, found the #BuildHybridAI hackathon and chose a phishing-checker Chrome
  extension. Made a 16-day plan with a feature freeze on 22 Nov.
- Created the Devpost draft: name "PhishLocal – Private & Offline Phishing Check with AI" and the
  elevator pitch "Your emails never leave your browser. PhishLocal uses on-device AI to spot
  phishing, explain every red flag, and work offline, with a cloud only as fallback."
  "PhishFinder" was rejected: several phishing extensions and an older Devpost project already
  use that name.
- Defined what makes PhishLocal different: on-device by default; personal data removed on-device
  before an optional cloud check; every red flag explained; en/de/fr/es on-device, other
  languages (e.g. Italian) through the cloud.
- Updated Chrome to version 157 and checked the hardware requirements for Gemini Nano.
- Enabled `#prompt-api-for-gemini-nano` (Enabled Multilingual), downloaded the model and ran a
  first prompt in the DevTools console (cold start about 4 min, warm prompt about 1 s).
- Created the Firebase project `phishlocal`, enabled AI Logic with the Gemini Developer API and
  enforced App Check (still unregistered, so cloud calls will fail until a debug token is set).

**Session with Claude Code:**

- Project setup: Vite + TypeScript + crxjs, MV3 manifest with a side panel, Firebase app
  initialisation from `.env.local`, Apache-2.0 license. Side panel tested in Chrome.
- GitHub repo connected (private at first); agreed on the git workflow (feature branch, small
  commits, PR, merge commit) and wrote it into `CLAUDE.md`. `TIMETABLE.md` added with the
  hackathon plan.
- Added formatting, linting, type check, structure tests and CI (PR #2). Builder and reviewer
  agents worked in parallel; two review rounds found and fixed false positives and gaps in the
  remote-code check.
- Moved from Node 25 to Node 26 LTS, fixed the PowerShell execution policy, upgraded Vitest to 5.
- Started this journey file.

### Sun 15 Nov 2026

**Before coding (Ricardo):**

- Created an App Check debug token in the Firebase console and put it into `.env.local`.

**Session with Claude Code (started late on Sat 14 Nov):**

- Planned the first hybrid prompt from the installed SDK types (firebase 13.3.0), then built it
  in four small commits on `feat/hybrid-prompt`.
- App Check with a `CustomProvider` and the debug token, used in dev builds only.
- `runPrompt()` with `InferenceMode.PREFER_ON_DEVICE` and the languages en, de, fr, es.
- Side panel: prompt field, run button, result with inference source and duration, and a
  development-only "Force cloud" switch.
- New test: the production build must not contain the debug token (checked with a planted token).
- Tested in Chrome with a phishing sample: on-device (Gemini Nano) answered in 314.1 s on the
  first run and in 646.1 s on the second, the cloud answered in 1.6 s. App Check accepted the
  debug token. Both paths work; the on-device speed is an open problem.
- Timing test in the DevTools console: model load (`LanguageModel.create()`) 571.8 s, prompts
  0.3 s, a second session 0.1 s. Checked the hardware (performance class "Very High",
  RTX 5070 Ti, 32 GB RAM) and the model folder; the GPU program cache files were empty.
- Moved the empty cache files to a backup and exited Chrome completely. After the restart the
  model loaded in 3.8 s, but the cache files were empty again, so the cache was not the cause.
- Added a warm-up: the side panel loads the model when it opens and shows its state. Result in
  Chrome: model ready in 3.8 s, then the on-device prompt took 1.0 s.
- Code review of the pull request: 9 findings. Fixed 4 in the same PR: the token leak test now
  reads every `.env*` file and the OS environment with Vite's own parser; a prompt sent during
  the warm-up no longer starts a second model load; the panel says where a prompt runs and
  explains App Check errors also for the automatic cloud fallback. The other findings are
  planned work (consent before cloud on 21 Nov, model download button, language support check in
  a fresh profile) or SDK behaviour (the debug token is printed in the DevTools console).
- Read the official contest rules. The repository must be public with a detectable open-source
  license and stay available until the end of judging (16 Dec); it must not contain PII, API
  keys or project secrets; App Check debug tokens are accepted in submissions.
- Before going public: scanned all 33 commits for secrets (none found). The only private
  personal data was the email address in the commit metadata. Rewrote the history to the GitHub
  noreply address and force-pushed `main`, then made the repository public. GitHub detects the
  Apache-2.0 license. The old commits in PRs #1–#4 still show the private address; deleting and
  recreating the repository would remove them, but that was not worth it, so we accepted it.
  GitHub now blocks pushes that would expose the private address.
- Turned on GitHub's free tools for public repos: a ruleset for `main`, secret scanning with push
  protection, CodeQL and Dependabot. The first scans found three things. CodeQL flagged the HTML
  comment removal in the remote-code test; the real gap was that `<!--> <script src=…>` could
  hide a script. The first fix (scan comments too) left a second gap: a fake `<script>` or
  `<style>` opening tag in a comment or attribute value could still swallow a real remote script.
  The third review found a quote trick in unquoted attribute values. The check now reads HTML
  with parse5 like the browser, cleans URLs like the browser (tabs, newlines), and also covers
  `<template>`, `style` attributes, `<iframe srcdoc>`, SVG links, `<meta http-equiv="refresh">`
  and more resource attributes. 33 new test cases; the previous regex version fails 21 of them.
  The CSS part had the same weakness and now uses lightningcss; CSS that cannot be parsed is
  reported. 13 more test cases; the old CSS regex fails all 5 that were tried against it.
  Dependabot flagged `@grpc/grpc-js` twice; dismissed as not used, with the reason.
- Wrote the decisions of the day into `CLAUDE.md` so every future session follows them: the
  noreply commit email, review until nothing new before a merge, the dependency rules, the
  debug-token rule, and the privacy and contest rules.
