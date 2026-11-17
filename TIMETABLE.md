# PhishLocal – Hackathon Timetable

**Deadline: Mon 30 Nov 2026, 23:00 Swiss time** (= 2:00 pm PST). Target: submit on Sun 29 Nov.
**Feature freeze: Sun 22 Nov, evening.** After that only polish, tests and bug fixes.

Mark a task `[x]` as soon as it is done. Keep this file in sync with reality.

## Phase 1 · Setup & go/no-go

- [x] Sat 14.11. – Update Chrome to the latest version (on-device AI needs Chrome 139+; we use 157)
- [x] Sat 14.11. – Check hardware (GPU >4 GB VRAM or 16 GB RAM + 4 cores, 22 GB free disk)
- [x] Sat 14.11. – Enable Gemini Nano flag (`#prompt-api-for-gemini-nano` → Enabled Multilingual)
- [x] Sat 14.11. – Download the model; `LanguageModel.availability()` returns "available"
- [x] Sat 14.11. – First test prompt in DevTools console (warm prompt ~1 s, first cold run ~4 min)
- [x] Sun 15.11. – Create Firebase project, enable AI Logic (Gemini Developer API); App Check enforced
- [x] Sun 15.11. – Extension skeleton: Vite + Manifest V3 + side panel (side panel tested in Chrome)
- [x] Sun 15.11. – First hybrid prompt from the side panel (`InferenceMode.PREFER_ON_DEVICE`)
      incl. App Check debug token so the cloud fallback works
- [x] Sun 15.11. – Create public GitHub repo, Apache-2.0 license visible in the About section

## Phase 2 · Email input & rules

- [x] Mon 16.11. – Content script: read sender, subject, body and links from the open Gmail email
      (done Sun 15.11; reads on button click)
- [x] Tue 17.11. – Paste fallback field in the side panel (demo must always work)
      (done Mon 16.11; plus three made-up sample emails)
- [x] Wed 18.11. – Rule checks in plain TypeScript (no AI): link text vs real domain,
      lookalike domains (e.g. paypa1.com), reply-to ≠ sender, urgency words (en/de/fr/es).
      (done Mon 16.11; Reply-To is not in the Gmail page, so a sender-name rule replaces it
      until the raw email task below; redirect services such as `c.gle` are only noted)
- [x] Wed 18.11. – Raw email: read the headers (Reply-To, Return-Path, SPF/DKIM/DMARC results)
      and add header rules; paste raw source from any mail app; parsed with postal-mime 4.2.0
      (done Mon 16.11)
- [x] Wed 18.11. – Automatic scan: while the side panel is open, every email opened in Gmail is
      read and checked without a click; its headers are loaded from Gmail's "Show original" page
      in the background (undocumented, measured 16.11; if it fails, the panel says so and pasting
      still works). Decided 16.11 instead of the optional setting planned for 23.11.
      (done Tue 17.11)

## Phase 3 · AI & result

- [ ] Thu 19.11. – Prompt + fixed JSON output schema (risk level, reasons, advice);
      feed the rule results into the prompt; answer in the user's language. Prompt injection
      (OWASP LLM01): email content and rule evidence only as escaped data; the AI must not lower
      a rule's danger finding
- [ ] Fri 20.11. – Result UI: traffic light 🟢🟡🔴, reasons, highlighted suspicious links
      (show the link's domain prominently, shorten long URLs); test end to end

## Phase 4 · Hybrid & Firebase (main selling point)

- [ ] Sat 21.11. – Cloud "deep check": only with explicit user consent; personal data
      (names, emails, phone numbers, IBANs) removed ON-DEVICE first; user sees what is sent;
      unsupported on-device languages (e.g. Italian) go to the cloud the same way. Never send raw
      headers (they hold the user's address and server IP addresses), only the rule findings
- [ ] Sun 22.11. – Remote Config for prompt & thresholds; App Check working → FEATURE FREEZE

## Phase 5 · Polish & test

- [ ] Mon 23.11. – UI polish: loading states, error messages, design (automatic scanning moved
      to 18.11)
- [ ] Tue 24.11. – Collect test emails (phishing samples + normal emails; private only, no company data)
- [ ] Wed 25.11. – Test and tune prompt/thresholds; note results
- [ ] Thu 26.11. – Fix bugs; test in a fresh Chrome profile and the cloud-only path

## Phase 6 · Submission

- [ ] Fri 27.11. – README: setup, how it works, how Firebase AI Logic is used
      (first version with features, privacy, setup and checks written Mon 16.11; finish it
      with the AI check, the consent flow and judge testing instructions)
- [ ] Sat 28.11. – Demo video (max 3 min, English, public on YouTube, app running in Chrome;
      warm up the model before recording); Devpost description; thumbnail (3:2)
- [ ] Sun 29.11. – Submit on Devpost, double-check every requirement
- [ ] Mon 30.11. – Buffer day only. Deadline 23:00 Swiss time.

## Devpost submission requirements (checklist)

- [ ] Working demo (hosted URL encouraged)
- [ ] Text description: how Firebase AI Logic is used, features, value proposition
- [ ] Public GitHub/GitLab repo: all source code + setup instructions, Firebase AI Logic actually
      imported and called at runtime, open-source license visible in About
- [ ] Repo and README describe the value proposition
- [ ] Repo stays public and the project stays testable until the end of judging (16 Dec 2026)
- [ ] No PII, production API keys or project secrets in the repo, submission form or testing
      instructions (App Check debug tokens are accepted in submissions; never commit one)
- [ ] Summary of what was built during the submission period (from 11 Nov); mention AI coding
      assistants and any pre-existing code
- [ ] Testing instructions: how judges install the extension and set up Firebase
- [ ] Submission form: platform Web (Chrome) selected
- [ ] Demo video ≤ 3 min, public on YouTube, English or English subtitles
- [ ] Project free of charge, all materials in English
