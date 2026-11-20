# PhishLocal

Chrome extension that checks emails for phishing on-device with Gemini Nano, using the cloud only
as a fallback.

> Your emails never leave your browser. PhishLocal uses on-device AI to spot phishing, explain
> every red flag, and work offline, with a cloud only as fallback.

Built for the Firebase #BuildHybridAI hackathon. **Status:** work in progress. The AI check of
an email comes next; see [`TIMETABLE.md`](TIMETABLE.md).

## What it does today

- **Side panel** (Chrome Manifest V3): click the toolbar icon to open it.
- **Automatic check in Gmail:** while the side panel is open, every email you open in Gmail is
  read and checked at once: sender, subject, visible text, and every link with its text and real
  target. Its headers (SPF, DKIM, DMARC, Reply-To) are loaded in the background from Gmail's own
  "Show original" page. When the panel is closed, nothing is read. Nothing leaves the browser.
- **Paste an email** from any other mail app, or load one of four made-up sample emails. Links
  keep their real targets from the copied formatting.
- **Sender checks from the headers:** for Gmail automatically; for other mail apps, paste the
  raw source ("View source") and PhishLocal also reads the headers: whether SPF, DKIM and DMARC passed, and where
  replies go. A forged sender whose domain says "not from us" (DMARC failed) is flagged as
  danger.
- **Red flags without AI:** rule checks list what is suspicious and why, in one sentence each.
  Dangerous links, link text that names a different domain than the real target, lookalike
  domains such as `paypa1.com`, a sender name that claims another domain or brand, invisible
  characters and lookalike letters, and pressure phrases in English, German, French, Spanish,
  Italian and Portuguese.
  All rules: [`docs/rules.md`](docs/rules.md).
- **AI verdict, on the device:** Gemini Nano rates every shown email (safe, suspicious,
  dangerous) with up to five reasons and one piece of advice, in your language. The rule checks
  are its lower limit, so an email that talks the AI into "safe" still shows as dangerous. How it
  works and how it resists prompt injection: [`docs/ai-check.md`](docs/ai-check.md).
- **Traffic light at the top:** green, yellow or red, each with its own symbol and word. It stays
  grey ("Checking…") until the AI has answered, unless the rules already found a warning.
- **Links at a glance:** every link shows where it really goes (the domain in bold, also the final
  target of a forwarding link), a shortened URL (the full one as tooltip) and its text. Links
  behind a red flag are marked, and each red flag names its links ("link 2").
- **Hybrid AI:** a test prompt runs through Firebase AI Logic with
  `InferenceMode.PREFER_ON_DEVICE`. Gemini Nano answers on the device; the cloud (Gemini
  Developer API) is the fallback. The panel loads the on-device model when it opens and shows
  where each prompt ran.

## Privacy

- Gmail emails are read only while the side panel is open, and processed in the browser. The
  headers come from Gmail itself (the same page as ⋮ → Show original), with your normal login;
  no other server is involved.
- The rule checks run locally, without network access. The AI check of real emails runs only
  on the device (Gemini Nano).
- No email is stored: everything is gone when the side panel closes.
- Email content is shown only as text, never rendered as HTML, so pasted emails can't load
  tracking pixels or run scripts.
- A cloud check will only happen with explicit consent, after personal data has been removed on
  the device (planned).
- Permissions: the side panel, and Gmail only (`https://mail.google.com/*`). The `scripting`
  permission is used once after an install or update, to start PhishLocal's Gmail script in
  Gmail tabs that were already open, so you don't have to reload Gmail.

## Setup

**You need:**

- Node.js 26 (see [`.nvmrc`](.nvmrc); 24.15 or newer also works);
- Chrome 139 or newer on hardware that supports Gemini Nano;
- a Firebase project with AI Logic and the Gemini Developer API enabled.

1. **Install:**

   ```sh
   npm ci
   ```

2. **Configure Firebase:** copy [`.env.example`](.env.example) to `.env.local` and fill in the
   `VITE_FIREBASE_*` values of your Firebase web app. `.env.local` is git-ignored.
3. **Optional, for the cloud path:** create an App Check debug token in the Firebase console
   (App Check > Apps > Manage debug tokens) and set `VITE_APPCHECK_DEBUG_TOKEN`. It is a secret.
   Only development builds (`npm run dev`) use it; release builds leave it out, so their cloud
   requests fail until App Check is set up for them.
4. **Enable Gemini Nano:** open `chrome://flags/#prompt-api-for-gemini-nano`, set it to "Enabled
   Multilingual", and restart Chrome. If the model is not on the device yet, the side panel shows
   "Download the on-device model" (about 4 GB, once).
5. **Build:** `npm run dev` (development build that rebuilds on changes) or `npm run build`
   (release build). Both write to `dist/`.
6. **Load the extension:** open `chrome://extensions`, turn on developer mode, click "Load
   unpacked" and choose `dist/`.

**Model load is slow?** If the model takes minutes to load, exit Chrome completely (also from the
system tray) and start it again.

## Development

```sh
npm run check   # format check, lint, type check, build, tests (the same as CI)
npm run format  # fix formatting
```

`npm run check` must pass before every commit. The tests include structure tests that fail if
the extension:

- loads remote code;
- asks for more permissions than allowed;
- turns strings into HTML;
- contains an API key or the App Check debug token;
- contains invisible characters.

**Monkey tests** (`tests/monkey/`) throw random, hostile input at the parsers, the rules and the
AI answer reader. They also play random event orders against the AI check and the whole side
panel: clicks, typing, pastes, Gmail messages and disconnects, with a model that answers, fails,
hangs or ignores its stop signal. After every step they check the panel's promises, for example:

- the verdict is never below the rules;
- a result is never shown for another email;
- only one model run at a time;
- email content never becomes markup;
- nothing keeps running at the end.

CI runs a fixed seed. For more and new cases (PowerShell):

```powershell
$env:MONKEY_SEED='random'; $env:MONKEY_RUNS='100'; npx vitest run tests/monkey
```

A failure names its seed and case; set `MONKEY_SEED` and `MONKEY_CASE` to replay it.

| Path                   | Contents                          |
| ---------------------- | --------------------------------- |
| `manifest.json`        | Extension manifest                |
| `src/sidepanel/`       | Side panel UI                     |
| `src/content/`         | Gmail content script              |
| `src/paste/`           | Pasted-email parsing and samples  |
| `src/ai/`, `src/ai.ts` | AI check (prompt, verdict, model) |
| `src/raw/`             | Raw email and header parsing      |
| `src/rules/`           | Rule checks                       |
| `src/firebase.ts`      | Firebase and App Check            |
| `tests/`               | Vitest tests                      |
| `docs/`                | Documentation                     |

How the project is built, and why: [`JOURNEY.md`](JOURNEY.md). Plan:
[`TIMETABLE.md`](TIMETABLE.md).

## License

[Apache-2.0](LICENSE)
