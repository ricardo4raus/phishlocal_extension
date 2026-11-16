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
- "Read open email" in the side panel reads the email open in Gmail (sender, subject, visible
  text, links with their text and real target) through a content script, only on click. Nothing
  leaves the browser. No AI check of the email yet.
- "Or paste an email" is the fallback for other mail apps and for the demo: paste an email
  (optionally with sender and subject) and the panel shows its text and links, including the
  real target behind each link text. Three made-up sample emails (two phishing, one harmless)
  load with one click.
- Rule checks (no AI, on-device, in milliseconds) list red flags for every email read or pasted:
  links that run code or hide their target, link text that names a different domain than the
  real target (also behind forwarding links such as `google.com/url?q=…`), lookalike domains
  (`paypa1.com`, `paypal.support`, `paypal.com.secure-login.example`), a sender name that claims
  another domain or brand, invisible characters and lookalike letters from other alphabets, and
  pressure phrases in English, German, French and Spanish. All rules are listed in
  [`docs/rules.md`](docs/rules.md).

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
- **Reading Gmail without guessing:** Gmail's class names are generated and undocumented. A
  DevTools snippet that printed only counts and class names (no email content) measured the
  real page before any code was written. Gmail's details box (with "Reply-To") closes as soon as
  DevTools gets focus, so that field could not be measured yet.
- **No `innerText` in tests:** jsdom has no layout, so `innerText` is undefined there. The code
  keeps the real `innerText` (which skips hidden text, a common phishing trick); the tests use a
  small stand-in. Hidden text in a real Gmail email still has to be checked in Chrome.
- **Pasted text has no links:** a plain-text paste shows only the link text ("paypal.com"), not
  where the link goes, which is the most important phishing signal. The clipboard also carries an
  HTML version with the real targets, but that HTML comes from the attacker. The panel reads it
  with parse5 (a parser that only builds a tree, never loads anything) and never puts it into
  the page.
- **Rules that don't cry wolf:** real emails also break simple rules. Google's own emails show
  "debattr.com" as link text but link to `c.gle`; mailing services put the customer's name in
  front of their own domain for click tracking; "password" appears in harmless emails ("we will
  never ask for your password"). Redirect services are only noted, names taken from the email
  give a warning instead of danger, and the phrase lists use phrases instead of single words.
  The three samples are tests: both phishing samples must get warnings, the harmless one none.
- **No Reply-To in Gmail's page:** Gmail shows Reply-To only in its details box. The rules use
  the sender name instead for now; the raw email (headers) is the next task.

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
- An extension needs fewer permissions than expected: the side panel can message the active tab
  (`chrome.tabs.sendMessage`) without the `tabs` permission, and a content script declared in
  the manifest needs no `host_permissions`. The only new access is the Gmail content script.
- Email content is attacker-controlled: it is shown only with `textContent`, and a test fails
  if the side panel ever renders it as HTML.
- `npm install --before=<date>` resolves a new package's dependencies only to releases older
  than that date, which keeps fresh (riskier) releases out of the lockfile.
- The browser's own `DOMParser` is not safe for untrusted HTML: MDN warns that it can download
  `<img>` and `<iframe>` resources, so a tracking pixel in a pasted email would tell the sender
  that it was opened. parse5 does not load anything.
- Chrome's enhanced spell check sends typed text to Google. The paste fields turn spell check
  off (`spellcheck="false"`), otherwise "nothing leaves your browser" would not be true.
- Sample emails use made-up brands and `.example` domains (reserved, they can never resolve):
  a real bank's name in a phishing sample could look like a real attack or a trademark problem.
- Comparing domains needs the Public Suffix List: `accounts.google.com` belongs to `google.com`,
  but `bank.github.io` and `evil.github.io` are different sites. tldts bundles the list; it was
  already in the lockfile through jsdom.
- Lookalike domains are found by mapping characters that look alike (`1`→`l`, `0`→`o`,
  `rn`→`m`) and allowing one typo, but only for names of six or more letters; otherwise
  "apply" would imitate "apple".
- Phishing hides words from filters with Unicode: zero-width characters inside a word
  ("con<U+200B>firm" looks like "confirm"), Cyrillic letters that look Latin, full-width letters. The
  rules now fold the text first (NFKC, invisible characters removed) and treat the tricks
  themselves as red flags.
- Our own tools can plant invisible characters: an editing tool turned the escape `\u200b` in a
  test into the real zero-width character. A structure test now rejects invisible characters in
  the source ("Trojan Source").
- A "no findings" message is a security statement: "no red flags" must not sound like "safe".
- The same library can be twice as large depending on which of its builds the bundler picks:
  tldts' ES module build adds 267 KB to the side panel, its prebuilt file only 130 KB.

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
- Gmail content script (planned for Mon 16 Nov, done a day early): measured the Gmail page with
  a content-free DevTools snippet, then built the extraction (selectors in one place, with
  fallbacks), the content script (Gmail only, reads only on click) and a "Read open email"
  button in the side panel. Added jsdom (pinned, dependencies older than two weeks) for DOM
  tests. Tested in Chrome on an open email, the inbox list and a non-Gmail tab; all three gave
  the expected result. Decided: automatic scanning when an email opens becomes an optional
  setting (off by default) on 23 Nov.

### Mon 16 Nov 2026

**Session with Claude Code:**

- Paste fallback (planned for Tue 17 Nov): researched safe ways to read pasted HTML, then built
  it in four small commits on `feat/paste-email`. A new structure test fails if `src/` ever turns
  a string into HTML. `parsePastedEmail()` takes the text, the sender and subject fields, and
  the links from the clipboard's HTML (parse5) and from URLs in the text. Three made-up samples,
  checked by a test against real brand names. The side panel got a collapsible "Or paste an
  email" area that shares the display with "Read open email".
- parse5 moved from a development to a runtime dependency; the side panel bundle grew from
  69 KB to 226 KB, which is fine for a local extension.
- Tested in Chrome: the samples load and show the real link targets; an email copied from Gmail
  and pasted shows its links with the real `c.gle` targets; Clear empties everything. The side
  panel's Network tab stayed empty during a paste with images, so no tracking pixel fired. The long
  tracking URLs make the link list hard to read; shortening them is planned for 20 Nov.
- Review of the branch: links from an earlier paste stuck to new text when the field was emptied
  and refilled. Fixed, with a test that fails without the fix.
- Rule checks (planned for Wed 18 Nov): planned with Ricardo, then built in small commits on
  `feat/rule-checks`: domain helpers with tldts, link rules, lookalike rules with a short list of
  often-imitated brands, sender-name rules, pressure phrases in four languages, and a "Red
  flags" list in the side panel. Reply-To is not in Gmail's page, so Ricardo decided to read the
  raw email next: Gmail's "Show original" in the background, plus pasting the raw source.
- Review of the branch: a name taken from the email in front of another domain was flagged as
  danger, but mailing services do that for click tracking. It is a warning now.
- Security review against OWASP Top 10, the OWASP Top 10 for LLM applications, CWE and MITRE
  ATT&CK's phishing techniques, with a probe that ran each suspected gap through the real code.
  No injection, script or crash risk; ten gaps and false alarms, all fixed with tests that fail
  without the fix: invisible characters and other alphabets slipped past the rules, a brand name
  with another ending (`paypal.support`) and forwarding links (`google.com/url?q=…`) passed clean,
  harmless sentences ("we will never ask for your card number") got warnings, a company's own
  domains in the sender name were "danger", "no red flags" sounded like "safe", and a failing
  rule showed a wrong error. The next review round found that one fix hid a case completely;
  it is a note now. The round after that found that a forwarding link's final target skipped
  the IP and international-letter checks; fixed too.
- Documentation: a README with features, privacy, setup and checks, and `docs/rules.md` with
  every rule, its severity, its reason and its limits.
- Tested the rule checks in Chrome: the three samples, three hand-written pastes (lookalike
  sender and brand in front of another domain, a forwarding link through google.com, a German
  email with an IP link and a fake sender name) and the real Google email. Every result matched
  the expected list line by line; the Google email with its `c.gle` links got only one note.
  Danger and warning labels are readable in dark mode.
