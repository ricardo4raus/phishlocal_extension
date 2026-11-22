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
- While the side panel is open, every email opened in Gmail is read (sender, subject, visible
  text, links with their text and real target) and checked automatically, and its headers are
  loaded from Gmail's own "Show original" page in the background. Closing the panel stops all
  reading. Nothing leaves the browser.
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
- Raw source pasted from any mail app ("Show original", "View source") is read with its headers:
  the side panel shows whether SPF, DKIM and DMARC passed and where replies go, and the rules
  flag a forged sender (DMARC failed) as danger and replies to another company as a warning.
- Every shown email gets an AI verdict from Gemini Nano, on-device only: safe, suspicious or
  dangerous, with up to five reasons and one piece of advice in the user's language. The rule
  checks are its lower limit: the AI can raise the verdict, never lower it.
- The rule checks cover English, German, French, Spanish, Italian and Portuguese.
- The verdict is a traffic light at the top (green, yellow, red, each with a symbol and a word);
  it stays grey until the AI has answered, unless the rules already found a warning. Each link
  shows its real domain in bold and a shortened URL, and links behind a red flag are marked.
- On request, a deep check in the cloud (Gemini through Firebase AI Logic): Gemini Nano finds
  names on the device, a privacy filter replaces names, addresses, numbers, IBANs and full links,
  and the panel shows exactly the data that will be sent. Only "Send to the cloud" sends it.

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
  On 21–22 Nov the slow loads came back after real Chrome restarts (125–537 s). A measuring
  script showed Chrome idle during the whole wait: no CPU, no GPU work, no memory growth, and
  Chrome's verbose log silent. RAM, disk, crash backoff, the GPU cache and a new NVIDIA driver
  were ruled out one by one. Only a PC restart helped (14.1 s), and only for the first Chrome
  start. The cause lies outside the extension; the demo routine is now "restart the PC first".
  Later that night a Chrome trace found where the minutes go: not into loading the weights
  (2.5 s), but into the first prefill, where the NVIDIA D3D12 driver blocks 1–7 s for about 80
  of 334 GPU compute pipelines that Chrome's ML library creates for every new service process.
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
- **No official way to read the headers automatically:** the Gmail API is official, but every
  scope that reads headers (`gmail.metadata`, `gmail.readonly`) is "restricted": without Google's
  weeks-long verification, every user sees an "unverified app" warning. A Gmail add-on runs on
  Google's servers, not in Chrome. The official manual way is Gmail's own "Show original" →
  "Copy to clipboard", so pasting raw source came first. For automatic scanning, Ricardo measured
  Gmail's undocumented "Show original" URL with content-free snippets: it needs an account key
  (`ik`) that only Gmail's own scripts contain, and a same-site request returns the raw email.
- **Bugs no hand-written test found:** the unit tests covered every case we thought of, and
  the monkey tests still found four bugs within minutes, in code that had already been reviewed
  several times. All four came from combinations nobody writes by hand: a phone number split by a
  tab, a link glued to a digit, two low surrogates in a row, rules failing on the second showing
  of the same email.
- **Cleaning data that is already cut:** the privacy filter worked on every hand-written case,
  and its monkey still found two leaks at 100 times the cases. Both came from text that had been
  cut before the filter saw it: an address cut to "anna@private." no longer looked like an
  address, and a subject cut at its limit ended in half an IBAN that no pattern recognizes.

## What we learned

- Gemini Nano in Chrome: the first prompt after a cold start can take minutes; warm prompts take
  about 1 s. On-device prompts need `expectedInputs` / `expectedOutputs` with languages.
- A slow step is not always heavy work: sampling CPU, GPU and memory every 5 s showed that a
  minutes-long model load was Chrome waiting, not loading. That ruled out every hardware theory
  at once.
- Sampling says "idle", a trace says where: Chrome's own trace (recorded over the DevTools
  protocol with the `gpu` and `optimization_guide` categories) and `chrome://histograms` named
  the exact call that waited, after three days of theories. Chrome also accepts a copied model
  folder in a fresh user data directory, so such measurements can run automated and repeatedly
  without touching the real profile.
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
- Email headers can be forged by the sender, including a fake `Authentication-Results:
dmarc=pass`. Only the topmost one, which the receiving server adds last, can be trusted
  (RFC 8601); `ARC-Authentication-Results` is a different header and is not used.
- One passing sender check is enough without DMARC: forwarding breaks SPF but keeps the DKIM
  signature.
- A parser can be safe and still be a denial-of-service: parse5 never runs scripts, but its time
  grows with the square of the nesting depth. Measure with hostile input, not only real emails.
- A multipart email has two bodies; the mail app shows the HTML one. Checking the other one is a
  gap an attacker can use.
- Firebase AI Logic's on-device path ignores `systemInstruction`; the system message has to go
  into the session's `initialPrompts`. The cloud path uses `systemInstruction` as usual.
- Escaping is not a defense against prompt injection: JSON keeps the email from breaking the
  prompt's structure, but the model still reads the text. What protects the user is outside the
  model: the rules as a lower limit, a strict check of the answer, no tools, and our own advice
  whenever the rules are stricter than the AI.
- A side panel can watch a tab without the `tabs` permission: `chrome.tabs.connect` reaches only
  our own content script, a closed panel closes the port, and the content script stops with it.
  That makes "read only while the panel is open" a property of the code, not a promise.
- The tricks we flag in emails can fool our own UI: a right-to-left override reversed text in
  the side panel too, so the panel now shows it as `<U+202E>`.
- A verdict UI is a security control too: showing "safe" in green before every check has
  answered tells the user to act on half a result. Grey "Checking…" is the honest state.
- A timeout that only stops waiting is not a timeout: the work goes on in the background and
  blocks what comes next. Stopping it needs a signal that reaches the model, and the SDK had
  none for on-device prompts.
- `InferenceMode.ONLY_ON_DEVICE` is not a guarantee by itself: without Chrome's Prompt API the
  SDK quietly uses the cloud. "Only on device" has to be checked by our own code too.
- Count what the model wrote before a timeout: "0 characters" pointed straight at session
  creation, not at a model that did not stop.
- Test a theory before building on it: "Chrome loads the model once per settings" fitted one
  measurement, and a second measurement after a Chrome restart disproved it. A warm-up at panel
  start is not enough either, because Chrome can unload the model later; checking right before
  each use is what holds.
- A retry needs to know the platform's limits: Chrome counts model crashes and blocks the model
  after three, so "try again" must first ask whether the model is available at all.
- A live region with a ticking counter is a screen reader announcing every second. Keep live
  regions for state changes and put counters next to them.
- Random tests need an oracle and a seed: "it did not crash" finds little; checking the
  panel's promises after every step (never below the rules, no result for another email) found
  the logic bug. A fixed seed keeps CI stable; a random seed finds new cases locally, and the
  seed in the failure message replays them.
- Run a filter on the text as the user will see it: cleaning that joins whitespace after the
  filter has run can rebuild what the filter removed.
- Let a small model point, not write: Gemini Nano only lists the names it sees, and our code
  removes only strings that are really in the text. A prompt injection can then make it miss a
  name, but never add anything to what leaves the device. Showing the exact data before sending
  covers the miss.
- A filter in front of the network should assume its input was already cut somewhere: patterns
  that need a whole address or IBAN miss the half that a field limit leaves behind.

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
  Danger and warning labels are readable in dark mode. PR #10 merged.
- Ricardo wanted automatic scanning with header checks. Compared the options (Gmail API with a
  restricted scope and Google's warning, a Gmail add-on, Gmail's undocumented "Show original"
  page, pasting raw source); Ricardo measured the undocumented page and chose it plus automatic
  scanning while the side panel is open. Split into two PRs: raw source and header rules first.
- Raw source and header rules (`feat/raw-email`): postal-mime 4.2.0 with tight limits,
  an `Authentication-Results` reader for nested comments and quotes, header rules (DMARC
  failed = danger, failed SPF/DKIM and Reply-To to another company = warning), raw-source
  detection in the paste field, a fourth sample (forged sender, raw source) and a "Sender checks"
  row in the side panel. A test proves that a fake `dmarc=pass` below the real result is ignored.
- Tested in Chrome: the raw sample showed every expected finding, and a real newsletter pasted
  from Gmail's "Show original" showed the same SPF, DKIM and DMARC results as Gmail's own table.
  The test found a false alarm from the earlier rule checks: Mailchimp's click-tracking host
  `chessable.us14.list-manage.com` was a warning ("chessable" in front of another domain). Known
  mailing services are now listed; the email's own name in front of them is not flagged, a real
  brand's name still is.
- Security review of the raw-email PR and every input (paste field, clipboard HTML, raw source,
  Gmail page, sender and subject fields) against OWASP Top 10, OWASP ASVS, CWE and MITRE ATT&CK,
  with a probe through the real code. No injection or code execution; seven issues, all fixed with
  tests that fail without the fix: deeply nested HTML crashed the check and, because parse5 slows
  down with the square of the depth, could freeze the panel for minutes; HTML over 2 MB was
  skipped silently; a harmless plain-text part hid a phishing HTML part; a right-to-left override
  ("moc.lapyap" shown as "paypal.com") had no finding and fooled our own panel; Clear during
  reading brought the old email back; fields had no length limits; raw-source detection stopped
  at 64 KB while the parser accepted 256 KB.

### Tue 17 Nov 2026

**Session with Claude Code (continued from Mon 16 Nov):**

- PR #11 (raw emails and header rules) merged after a short Chrome test.
- Automatic scanning (`feat/auto-scan`, planned for Wed 18 Nov), in small commits:
  - a port protocol between side panel and Gmail tab, with validators on both sides;
  - the content script finds Gmail's account key and the message ID (both strictly checked) and
    loads the "Show original" page same-origin, without redirects, with a 1 MB and 10 s limit;
  - a watcher reports each opened email while the panel is connected, at most every 300 ms,
    skips the same message by its ID, aborts the request of an email that is no longer open,
    and stops when the panel closes;
  - the side panel parses the page with parse5 (only the header block) and trusts the sender
    checks only from `mx.google.com`; it shows the email at once and again with the headers;
  - the old one-off "read on click" request is gone: the button asks over the same port.
- Self-review found three issues, fixed with tests: "unreadable" was sent on every Gmail page
  change, the old email stayed visible after "unreadable", and connecting to a `chrome://` tab
  could throw. The content script stays at about 6 KB, without parse5 or postal-mime; no new
  permissions.
- Tested in Chrome: an opened newsletter was checked without a click and showed the same sender
  checks as Gmail's own table; several emails in a row, the inbox, tab switches, closing and
  reopening the panel, and a sample followed by a Gmail email all worked.
- Second review of the PR found four more issues, fixed with tests: overlapping connects left an
  old port (and its watcher) running in the background; content Gmail rendered after the first
  check was never checked; a stopped request still sent a failure; an unexpected error left the
  status at "Loading…".
- AI check (`feat/ai-check`, planned for Thu 19 Nov), planned and then reviewed again before
  coding (Ricardo asked for that). The second look changed the plan: links, addresses and phone
  numbers are removed from AI text, our own advice replaces the AI's when the rules are stricter,
  the AI waits at most 3 s for Gmail's headers, and only basic JSON Schema keywords are used.
  Built in small commits: verdict schema and strict reader, prompt builder with random markers,
  on-device model (`ONLY_ON_DEVICE`, system message as `initialPrompts`), the "Verdict" block
  with a newest-only queue, Italian and Portuguese pressure phrases, and a sample that tries to
  talk the AI into "safe". Ricardo asked for Italian and Portuguese; whether Gemini Nano can
  answer in them is measured in Chrome.
- Chrome test of the AI check: Ricardo measured the languages (Italian and Portuguese work but
  are "experimental" in Gemini Nano) and found a false alarm: a real Google security notice with
  SPF, DKIM and DMARC pass was "suspicious" for the AI. Causes: the AI never saw the sender
  checks, the cleanup hid the sender's own address ("'[removed]' is unusual"), and Gemini Nano is
  cautious with account notices. Fixed: the AI now gets the sender checks and a rule about
  confirmed senders, the email's own addresses stay readable, each reason is one sentence, and
  the AI answers in Italian and Portuguese with an "experimental" note.
- Second Chrome test: the Google notice was still "suspicious", although the AI itself noted
  "DMARC pass". As proposed for this case, the AI alone can no longer raise the verdict for a
  confirmed sender (DMARC pass) without rule warnings; its points appear as notes. Learning: a
  small on-device model needs guard rails in both directions, against being talked into "safe"
  and against false alarms on real notices.
- Third Chrome test: the panel stayed at "AI check waiting…" for long. Reading the queue showed
  that Gmail's repeated display of one email ran the same check twice, and that a hanging or
  failing run could block the queue for good. Now one run serves the same email, runs stop after
  60 s, and the status shows the seconds while a check runs or waits.
- Review of the model and answer path (Ricardo asked for it): in a fresh Chrome profile the model
  could never be downloaded (Chrome needs a click, and there was no button), loading the model
  counted against the 60 s limit, and Gmail's repeated display of an email still wasted runs.
  Fixed: a download button with progress, a separate wait for the model, and a check that starts
  only once the email has not changed for half a second.

### Wed 18 Nov 2026

**Session with Claude Code (continued):**

- Ricardo tested the fixes in Chrome ("works now"); PR #13 (AI check) merged.
- Result UI (`feat/result-ui`, planned for Fri 20 Nov). Reviewing the plan before coding changed
  it in eight places. The biggest: lookalike findings cover a domain, not one link, so a finding
  now names all its links; and a green light before the AI has answered would invite a click, so
  the light stays grey until then.
- Built in small commits: a helper that shows a link's real domain and a shortened URL (the host
  is never cut, the decoy before an "@" is left out), link positions in the findings, a numbered
  link list with marks, and the traffic light with a symbol and a word for each level.
- Self-review found that an email shown again (Gmail renders it anew, or the user goes back to
  it) started a new AI run and turned the light grey again. The panel now keeps the last 20
  answers in memory; a test fails without the fix.
- Chrome test: the traffic light and the links worked, but the AI check of the Google notice
  failed with "no answer within 60 s" although the model was loaded in 4.2 s. Ricardo asked for
  the logic issues behind the repeated failures. Tracing the path through the SDK found them:
  - a run the panel gave up on kept running in Chrome, because the SDK passes no stop signal to
    on-device prompts; Gemini Nano works on one prompt at a time, so the next checks waited
    behind it;
  - a check for an email the user had left kept the model busy, and one that waited for the
    model ran even after its email was gone;
  - an answer had no length limit, and a timeout did not say whether the model hung or kept
    writing;
  - after the model download, the email on screen was not checked again.
    Fixed: the panel stops a run (in Chrome too) on timeout and when its email is left, the answer
    is streamed and cut off after 4,000 characters, a timeout says how many characters the model
    had written, and the download rechecks the shown email. Each fix has a test that fails without
    it.
- While testing through the real SDK, the first version of a test made a request to Google's
  cloud with a made-up key and the word "prompt": the SDK's Node build has no on-device path and
  sends `ONLY_ON_DEVICE` requests to the cloud. The browser build does the same when Chrome's
  Prompt API is missing. `runAiCheck()` now checks for the API right before the call, and the
  test stubs `fetch` so no test can reach the network.
- Ricardo asked for three things. A failed AI check now says so on the verdict line ("rule checks
  only: the AI check failed"); the light keeps the rules' colour. Gmail had to be reloaded after
  every install or update of PhishLocal: Chrome injects manifest content scripts only on new page
  loads. Ricardo chose automatic injection into open Gmail tabs, which needs the `scripting`
  permission and host access to Gmail (the same install warning as before). The answer cache
  stays in the panel's memory only, as Ricardo decided.

### Thu 19 Nov 2026

**Session with Claude Code (continued):**

- Chrome test: the AI check worked once, then failed again with "no answer within 60 s; the
  model had written 0 characters", so the model hung before its first word. Ricardo ran a
  timing snippet in the side panel's console: the first session with the check's settings took
  249 s to create, the next four 0.0 s, and each answer came in about 2 s. The snippet also
  confirmed that Chrome streams the answer in pieces.
- First theory: Chrome loads the model once per session settings, and the warm-up used other
  settings than the check. The warm-up was changed to the check's settings. Ricardo wanted the
  load to be fast for sure, not hopefully, so we tested the theory: after a full Chrome exit, the
  panel's warm-up took 304.8 s, and then sessions with three different settings took 0.0–0.1 s.
  The theory was wrong; the settings do not matter. Two facts remained: the first load after a
  Chrome start takes about five minutes on this machine (3.8 s on 15 Nov), and Chrome can unload
  the model while the panel is open, so a later session needs the full load again (the 249 s).
- Fix in our control: right before each check, the panel opens a session itself, outside the
  check's time limit. It takes 0.0 s while the model is loaded and reloads it otherwise, so a
  reload shows as "waits for the on-device model to load" instead of a timeout. How long Chrome
  takes to load the model is Chrome's; the extension cannot guarantee it.
- Diagnosis in Chrome: `chrome://on-device-internals` logged "Terminated on-device session for
  LanguageModel. Reason: Session crashed", so the model process had crashed, and the next session
  needed a full reload. Setting Chrome to the NVIDIA GPU in Windows did not make the load faster.
  The load time stays Chrome's.
- For a polished experience anyway (Ricardo's request): a failed run is tried once more after
  checking the model again, and a long load says what is happening ("Rule checks done. The
  on-device AI is still loading…; the result appears here by itself") instead of a bare counter.
  Planned and reviewed before coding; a research agent and two review agents (logic; security,
  accessibility and wording) checked the change.
- The research found a risk in Chromium's source: after 3 model crashes Chrome refuses new
  sessions for a while (1 min, growing to 1 h). A retry must not hammer a blocked model, so the
  panel now asks `availability()` before opening a session. The logic review found four small
  bugs (a misleading "failed twice" when the two tries failed differently, retrying an input
  that is too large, "Rule checks done" when the rules had failed, and a stopped run adopted for
  an email shown again). The accessibility review found that two status lines with a seconds
  counter were live regions (a screen reader could announce them every second), two text
  colours below 4.5:1, and that the new Gmail permission deserves a guard: structure tests now
  allow network requests only in the Gmail content script and `chrome.scripting` only in
  `src/inject.ts`. All fixed, each with a test that fails without it where testable.
- Ricardo asked for a "monkey test". Three monkey tests now run in CI (`tests/monkey/`), from
  a seeded random generator, so every failure can be replayed:
  - random hostile input (invisible and direction characters, lone surrogates, deep HTML, broken
    MIME, injected JSON) for the rules, the parsers, the prompt and the AI answer reader;
  - a chaos monkey for the AI check: random emails shown and hidden, random time jumps, and a
    model that answers, fails, crashes, hangs or ignores its stop signal;
  - a UI monkey for the whole side panel (real `index.html` and `main.ts`, fake Chrome and
    model): random clicks, typing, pastes, samples, Gmail messages and disconnects.
- After every step the monkeys check the panel's promises: the verdict is never below the
  rules, no result for another email, one model run at a time, no markup from email content,
  and at the end nothing still running and no button stuck.
- The monkeys found four bugs, each now fixed with a regression test that fails without it:
  - the AI answer reader let a phone number through when the model split it with line breaks
    or invisible characters, or wrote it in fullwidth digits; whitespace was joined only after
    the filter ran;
  - a link glued to a word ("4567https://evil.example") slipped past the link filter;
  - parse5 8.0.1 throws on two low surrogates in a row, so one such pair made a pasted email
    unreadable;
  - an email shown again while its check ran joined that check with the old findings: if the
    rules had failed this time, a "safe" AI answer showed green instead of at least yellow.
- A 100× run (about 200,000 random cases) found one more failure, but in the test's own check:
  the allowed sender address, cut at 300 characters, no longer looked allowed.
- Two review agents checked the PR. The first found older gaps in the AI answer reader, all
  fixed: links with other schemes (`ftp://`), phone numbers in Arabic-Indic digits or with `/`
  and dashes, domains written with ideographic full stops, and a reused answer that could name
  the Reply-To address of a different email with the same prompt. The second found weak spots in
  the monkeys themselves: the UI monkey now also counts live model runs, checks that no counter
  or download percentage is left when nothing loads, and that no timer runs at the end; the
  chaos monkey covers confirmed senders; the link check asserts the host is kept.
- Fixing the reused answer made the UI monkey fail at once with "URI malformed": a `mailto:%E0`
  link made `decodeURIComponent` throw. Before, that error was caught inside the AI run, so any
  email with such a link (attacker-written) silently turned its AI check into "failed". Fixed.
- A second review round found that the phone filter now also removed deadlines from the AI's
  reasons ("pay by 19/11/2026"; dates with dots were already removed before). Dates and year
  ranges are now kept, and the minus sign, middle dots and bullets count as phone separators.
  The review also noted that the monkey's phone check copied the source's own pattern, so a gap
  in the pattern could never fail it. The new check is independent: the planted phone digits
  must not stay readable as one run. It immediately flagged a fragment left behind when a link
  swallowed half of a glued phone number; that fragment is shorter than the 9 characters the
  filter needs by design, so the check now looks for 8-digit cores. The chaos monkey also got
  an email variant with a Reply-To, and the answer shown must come from a run that got exactly
  the shown email's own addresses (the ones the model may name).
- Review round 3 found a hole in the date exception: number shapes like "0791-2345" or
  "555-12-3456" counted as dates and stayed visible. Dates now need real date shapes (day and
  month with 1 or 2 digits and plausible values). The phone separators are now a written
  spec (any dash punctuation, dots, bullets, slashes, parentheses), written in the docs and
  kept in sync by hand in the code and the monkey's check; other characters such as "[" split a number, which a 100x run
  showed and which is now a documented gap.
- Review round 4 found two smaller gaps in the date exception: dates in Arabic-Indic digits
  skipped the value check (so an implausible "date" stayed), and a time after a date
  ("19.11.2026 12:00") made the whole match look like a phone number, so the deadline was
  removed. Digits of every script are now read as their values, and a match is checked in parts
  split at spaces.
- Review round 5 found that this part-by-part check opened a leak: a date placed between the
  groups of a phone number ("079 19.11.2026 123 4567") split it into pieces too short for the
  filter, so the whole number stayed readable. Now the parts that are not dates are joined and
  checked as one; a phone number right next to a date takes the date with it. Five review rounds
  on one filter: each fix for false alarms opened a new way around it, and each was caught by a
  test written for the earlier round.
- Review round 6 found no leak. It found that the stricter rule now also drops a deadline
  followed by a space-grouped amount ("bis 19.11.2026 4 500 000.00 CHF"); keeping it would
  reopen the leak, so it is a documented limit. The monkey's own phone check got a test of its
  own, after the review showed it also hid one planted number.

### Fri 20 Nov 2026

- PR #14 (result UI) and PR #15 (monkey tests) merged after a last check on `main` (853 tests).

### Sat 21 Nov 2026

**Session with Claude Code:**

- Planned the cloud deep check, and Ricardo approved the plan:
  - consent every time;
  - names found by Gemini Nano plus greetings;
  - sender check results sent, raw headers never;
  - the SDK's default cloud model.
- The privacy filter (`src/privacy/redact.ts`) runs on the device:
  - links become their host;
  - addresses keep only their domain;
  - IBANs and long numbers become placeholders, dates stay;
  - names become "[name]".
    The answer reader's link, address and phone patterns moved to a shared module for it.
- Gemini Nano finds the names (`findNames()`, `ONLY_ON_DEVICE` with the guard against the SDK's
  silent cloud call). It only points; the code removes only strings that are in the text.
- The cloud call (`runCloudCheck()`) has:
  - its own system message;
  - the verdict schema as `responseJsonSchema`;
  - a time limit and a stop signal.
    Tests run it through the SDK's browser build with `fetch` faked, and check that the request
    holds exactly the prompt.
- Side panel:
  - "Prepare a deep check…" shows the exact JSON and what was removed;
  - only "Send to the cloud" sends it, once;
  - another email stops it, and late answers are dropped;
  - work that ignores its stop signal is given up after 2 s.
    A mutation test (the panel sending by itself) failed both the view tests and the UI monkey,
    which now checks that no cloud request goes without a click on Send with the data on screen.
- A privacy monkey plants a name, an address, a phone number, an IBAN, a user-ID link and hostile
  headers in random emails. At 100 times the cases it found two leaks, both fixed with
  regression tests:
  - an address cut short at the end of a field;
  - half an IBAN at the end of a subject that was already cut where the email was read.
- Random 100× runs of all monkeys found three older gaps in the AI answer reader (already on
  `main`), all fixed with regression tests:
  - an accent behind an invisible mark did not join its letter, so the sender's address passed
    and then showed as "examplé";
  - the cut at 300 characters turned the end of a long word into a valid-looking domain;
  - "https://" before a space became "https://…" after the cut.
- Two review agents checked the branch (privacy and security; logic and UI). No way to send
  without consent, but real gaps, all fixed with tests:
  - the invisible-character rule's message quoted the email's words, so a name split by a
    zero-width space went to the cloud; such messages now go as a fixed text;
  - names were matched case-sensitively ("ANNA MUSTER" stayed);
  - a flood or a list from Nano dropped names silently; lists are split, and the preview warns;
  - links without a scheme kept their path ("login.example/verify?uid=…");
  - Gmail showing the email again (with its headers) wiped a running request's record without a
    word; the deep check now waits for the headers, and the panel says what happened;
  - a model load of minutes ran inside the name search's 20 s limit; the panel now waits for the
    model first;
  - the name search and the request could not be stopped; a Stop button, focus handling, the
    warning in the live status, and short cloud errors without the request URL.
- Review round 2 checked those fixes and found that some of them had opened new gaps:
  - splitting Nano's list on "e" and "y" used `\b`, which knows only ASCII letters, so "Renée"
    split into "René" and the first name leaked;
  - the 3-letter minimum for name parts let 2-letter surnames (Li, Ng) through, and matching
    parts in any case removed ordinary words ("will", "bank") and even changed placeholders;
    now a full name matches in any case, a single word only as written or in capitals;
  - links without a scheme with a port, a punycode ending, an IP address or a user name in
    front kept their path;
  - Gmail shows an email again in two steps, and the second step wiped the round-1 note;
  - a long reason without spaces (Japanese) became just "…".
- All round-2 findings were fixed with tests. The lesson of the answer reader's filter repeated
  itself: each fix for one gap needs its own review.
- Review round 3 found that shielding the placeholders from the name step was itself a gap: a
  literal "[link: " in an email shielded every name up to the next bracket, and names inside
  hosts were lower-cased and kept. Instead of patching the shield, the order changed: names are
  now replaced first, before any placeholder exists. Single words match in any case, except that
  a lower-case word counts only inside a host or address, which also fixed "Anna" after "ANNA"
  and the German capital ẞ. Also fixed: a "?" in a link's password, IPv6 links, Japanese reasons
  cut to their first sentence, greeting words that are surnames ("Dear Mr Gentile"), and focus on
  a disabled button.
- Review round 4 found that names-first opened two leaks: a "[name]" in the middle of an address
  or a host broke those patterns, so "hans.[name]@private.example" sent the first name and a
  link whose host held a name kept its path and user ID. The fix keeps the order but lets each
  name stand as one letter that normalized text cannot hold (a mathematical bold "N", which NFKC
  folds away) until the end, so the address and link patterns still see whole words. A
  mutation check (writing "[name]" at once again) fails the new test. The random monkeys found
  one more: a body cut at its limit by a source that did not mark it as cut ended in half an
  IBAN; a body at its limit now always counts as cut.
- Random runs also found an older gap in the AI answer reader: "+49 30/12/34 56789" holds a
  date-shaped group, and the rest alone is too short to look like a phone number. A "+" never
  starts a date, so such a match is now removed.
- PR #16 opened. Review round 5 found one more leak: link targets, address domains and DKIM
  domains skipped the name filter ("secure.anna-muster.example" went out as is). They now go
  through it, as written instead of punycode. It also found that the "+" rule removed deadlines
  after a time zone ("UTC+1 19.11.2026"), and that hosts read from the text kept percent-encoded
  paths or punctuation. All fixed with tests.
- Review round 6 found that running hosts through the whole filter turned "www.bank.example" into
  a link placeholder, that a host read only as written could show a false target
  ("lumorabank.example%2Eevil.example"), and that the time-zone exception let "GMT+49 30/12/34
  56789" through. Hosts now get their own filter (names and numbers only), a host is taken as
  written only when a browser reads the same host, and after a time zone only a time may stand
  next to the date.
- Review round 7 found that a trailing dot ("müller.example.") made the browser's host differ,
  so its punycode went out unfiltered; hosts now compare without it, names are also matched as
  punycode labels, digits next to a name in a host no longer hide it ("anna1985.example"),
  only an address's domain goes through the host filter ("Dear Email User" broke "[email]"),
  and raw hosts are always normalized. The remaining edge cases (a name inside a longer
  punycode label, the Turkish dotted İ) are documented limits.

### Sun 22 Nov 2026

**Session with Claude Code:**

- First real deep check in Chrome (dev build, App Check debug token): a Google "you shared data
  with debattr.com" email. The preview showed both addresses as `[email]@domain` and the links as
  hosts only; the cloud (`gemini-3.5-flash-lite`) answered in 1.9 s with "No signs of phishing"
  and sound reasons in German. The SDK's default model stays.
- The first try showed no button: `npm run check` had overwritten `dist` with a production build,
  which has no App Check, so the panel correctly offered no deep check. `npm run dev` fixed it.
- The on-device model loaded in 383–537 s. Measured instead of guessed:
  - Chrome had not exited the first time (a process from 19 Nov was still running);
  - after a real exit: still minutes, with Chrome idle the whole time (CPU about 0, GPU 0 %,
    10 GB RAM free); disk reads the 4 GB weights in 0.7 s;
  - Chrome's `Local State`: `model_crash_count` 0, performance class 6 (highest), RTX 5070 Ti;
  - fresh GPU cache files stayed empty and did not speed up the next load;
  - Chrome's verbose log: nothing between the request and the ready model;
  - NVIDIA driver update plus PC restart: 14.1 s; the next Chrome restart: 125 s again.
- Decision: stop debugging before the feature freeze. The demo routine is now "restart the PC,
  start Chrome, open the panel once"; `docs/model-load-debugging.md` records every measurement,
  method and open question.
- PR #16 (cloud deep check) merged.
- Planned the last Phase 4 task with Ricardo. App Check for judges: a separate "judges build"
  (`npm run build:judges` into `dist-judges/`) with a second debug token made only for them, so
  judges can use the deep check without any setup; the token is revoked after judging. A browser
  extension has no real App Check attestation, so a public release would need a token server.
- Remote Config: the cloud model (allow-list), three time limits and extra guidance for the AI,
  each checked on arrival with a default in the code. The prompt's security rules stay in the code;
  extra guidance only adds a framed line after them.
- Three review rounds by agents. They found, among others:
  - `.env.local` is loaded in every Vite mode, so the judges build could have taken the
    developer's own token if anything turned `DEV` on; the judges mode is now checked first, the
    build refuses an equal token, and a test scans `dist-judges/`;
  - for up to 2 s after opening, clicks and pastes went nowhere while the settings loaded; the
    panel is now inert until then, with a "Starting…" line outside it for screen readers;
  - invisible characters that are letters or marks (variation selectors, fillers) passed the
    filter for extra guidance; it now uses Unicode's own "default ignorable" set;
  - the privacy text first said too little, then too much about the Remote Config request; it now
    matches the SDK source.
- The UI monkey had a hidden weakness: with random seeds it reached the "sent" state of the deep
  check in only 1 of 6 runs, also before this work; the fixed CI seed reached it by luck. Its calm
  phase now runs one whole deep check. It also caught that jsdom ignores `.inert = false`.
- Tested in Chrome: Ricardo created the five Remote Config parameters and the judges' token. The
  dev build and the judges build (loaded from `dist-judges/`, no dev server) both ran a deep check
  (1.9 s and 1.7 s). In one run Gemini Nano listed 32 "names", among them "Google", so the
  sender's name and the DKIM and address domains became "[name]": safe for privacy, but the cloud
  lost evidence. In the next run Nano found none. To fix after the freeze.
- Again the PowerShell encoding trap: rewriting a file with `Get-Content -Raw` turned "…" into
  "â€¦", and the tool layer turned an escaped code point in a regex into the real, invisible
  character. Code points now go into code as numbers.
- PR #17 merged. Feature freeze.

**Second session with Claude Code (night, research only, no code changes):**

- Research task: find the cause of the slow model loads. Two agents read Chromium's source
  (release 157) and searched for public reports; a test page, a copied Chrome test profile and
  a trace recorded over the DevTools protocol measured six fresh Chrome starts without touching
  the real profile.
- Found: the weights load in 2.5 s (`OnDeviceModel.LoadModelDuration`). The minutes are the
  first prefill: Chrome's ML library creates 334 GPU compute pipelines, and about 80 of them
  block 1–7 s each in the NVIDIA D3D12 driver with the CPU idle (107–315 s in total). Without
  `initialPrompts`, `create()` takes 3 s and the first prompt takes the minutes; the panel's
  sessions have `initialPrompts`, so for the panel the wait sits in `create()`.
- Every new service process (after each Chrome restart and after idle time) rebuilds the
  pipelines, because Chrome's program cache stays empty. Three Chrome switches (integrated GPU,
  no host-mapped pointers, no driver warm-up) changed nothing. Defender, the network and the
  Wi-Fi card's PCIe warnings were ruled out.
- Nothing public matches the pattern; it may be specific to this GPU and driver. Next: measure on
  a second PC, then file a Chromium bug with the trace. Details in
  `docs/model-load-debugging.md`.
