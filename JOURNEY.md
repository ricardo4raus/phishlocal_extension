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

_To fill in by Ricardo: why phishing, why on-device, personal experiences._

Starting point from the project brief: email is private, so sending every email to a cloud AI
to check it for phishing defeats the purpose. Chrome now ships Gemini Nano on-device, and
Firebase AI Logic can run a prompt on-device first and use the cloud only as a fallback.

## What it does

_Current state, updated as features land._

- Chrome extension (Manifest V3) with a side panel. Clicking the toolbar icon opens it.
- No phishing check yet.

## How we built it

- **Stack:** Chrome Manifest V3, Vite 8, TypeScript 7, `@crxjs/vite-plugin`, Firebase JS SDK
  (`firebase/ai` hybrid inference with `InferenceMode.PREFER_ON_DEVICE`), plain HTML and CSS.
- **AI pair programming:** built with Claude Code. Each task starts with a short plan, then
  small commits on a feature branch, a pull request and a merge commit after review.
- **Quality checks:** Prettier, Oxlint, a TypeScript type check, Vitest structure tests and
  GitHub Actions CI. One command, `npm run check`, runs everything locally and in CI.
- **Privacy guarded by tests:** the tests fail if the build loads remote code, the manifest asks
  for more permissions than allowed, or an API key ends up in a committed file.

## Challenges

- **Linting TypeScript 7:** typescript-eslint supports only TypeScript < 6.1. We used Oxlint
  instead of downgrading TypeScript.
- **"No remote code" is hard to check:** a first, regex-based check missed runtime script
  loading and flagged harmless strings such as phishing samples. It was rewritten to walk the
  syntax tree (Vite's `parseSync`), then tested against realistic future code.
- **Firebase in an extension:** the browser builds of Firebase Auth and the reCAPTCHA App Check
  provider load scripts from Google servers, which MV3 does not allow. Use
  `firebase/auth/web-extension` and an App Check `CustomProvider` with a debug token.
- **Windows tooling:** Node 25 (non-LTS, end of life) blocked Vitest 5; PowerShell's execution
  policy blocked `npm.ps1` after reinstalling Node; Vitest fails in Git Bash when the drive
  letter is lowercase (`/c/...`).

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

## Accomplishments we're proud of

_To fill in as the project progresses._

## What's next

_To fill in near the submission._

## Daily log

### Sat 14 Nov 2026

**Before coding (Ricardo):**

- Updated Chrome to version 157 and checked the hardware requirements for Gemini Nano.
- Enabled `#prompt-api-for-gemini-nano` (Enabled Multilingual), downloaded the model and ran a
  first prompt in the DevTools console (cold start about 4 min, warm prompt about 1 s).
- Created the Firebase project `phishlocal`, enabled AI Logic with the Gemini Developer API and
  enforced App Check (still unregistered, so cloud calls will fail until a debug token is set).

**Session with Claude Code:**

- Project setup: Vite + TypeScript + crxjs, MV3 manifest with a side panel, Firebase app
  initialisation from `.env.local`, Apache-2.0 license. Side panel tested in Chrome.
- Public GitHub repo connected; agreed on the git workflow (feature branch, small commits, PR,
  merge commit) and wrote it into `CLAUDE.md`. `TIMETABLE.md` added with the hackathon plan.
- Added formatting, linting, type check, structure tests and CI (PR #2). Builder and reviewer
  agents worked in parallel; two review rounds found and fixed false positives and gaps in the
  remote-code check.
- Moved from Node 25 to Node 26 LTS, fixed the PowerShell execution policy, upgraded Vitest to 5.
- Started this journey file.
