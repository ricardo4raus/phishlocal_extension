<p align="center">
  <img src="design/logo.svg" alt="PhishLocal logo: a smiling koi inside a house" width="160">
</p>

# PhishLocal

Chrome extension that checks emails for phishing on-device with Gemini Nano, using the cloud only
as a fallback.

> Your emails never leave your browser. PhishLocal uses on-device AI to spot phishing, explain
> every red flag, and work offline, with a cloud only as fallback.

Built for the Firebase #BuildHybridAI hackathon. **Status:** work in progress. The AI check of
an email comes next; see [`TIMETABLE.md`](TIMETABLE.md).

## What it does today

- **Side panel** (Chrome Manifest V3): click the toolbar icon to open it. After the first install
  a welcome page opens once: how to start, and how your privacy is kept.
- **Six languages:** the panel and the AI's answers in English, German, French, Spanish, Italian
  or Portuguese. "Automatic" follows Chrome's language; the flag button (or Settings, which also
  offers "Automatic" again) picks another one, which is remembered in this browser.
- **Automatic check in Gmail:** while the side panel is open, every email you open in Gmail is
  read and checked at once: sender, subject, visible text, and every link with its text and real
  target. Its headers (SPF, DKIM, DMARC, Reply-To) are loaded in the background from Gmail's own
  "Show original" page. When the panel is closed, nothing is read. Nothing leaves the browser.
- **Paste an email** from any other mail app ("Check another email" at the bottom of the panel).
  Links keep their real targets from the copied formatting. Development and judges builds also
  offer five made-up sample emails.
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
  dangerous) with up to five reasons and one piece of advice, in the panel's language. The rule checks
  are its lower limit, so an email that talks the AI into "safe" still shows as dangerous. How it
  works and how it resists prompt injection: [`docs/ai-check.md`](docs/ai-check.md).
- **Traffic light at the top:** green, yellow or red, each with its own symbol and word. It stays
  grey ("Checking…") until the AI has answered, unless the rules already found a warning.
- **Links at a glance:** every link shows where it really goes (the domain in bold, also the final
  target of a forwarding link), a shortened URL (the full one as tooltip) and its text. Links
  behind a red flag are marked, and each red flag names its links ("link 2").
- **Deep check in the cloud, only on request:** a larger Gemini model in the cloud checks the
  email again. Before anything is sent, a privacy filter on the device replaces email addresses
  (domain kept), phone and other long numbers, IBANs and full links (host kept). At privacy level
  "High" it also removes the names of people, found by Gemini Nano on the device; "Standard"
  (the default) keeps names, so the cloud sees whether an email was written for you or for
  everyone. The panel shows exactly what will be sent; only "Send to the cloud" sends it.
  Details: [`docs/ai-check.md`](docs/ai-check.md#deep-check-in-the-cloud).
- **Hybrid AI:** a test prompt runs through Firebase AI Logic with
  `InferenceMode.PREFER_ON_DEVICE`. Gemini Nano answers on the device; the cloud (Gemini
  Developer API) is the fallback. The panel loads the on-device model when it opens and shows
  where each prompt ran.
- **Settings without a new release:** Firebase Remote Config sets the cloud model (from an
  allow-list), the time limits and extra guidance for the AI, all checked on arrival and with
  defaults in the code. The prompt's security rules stay in the code. Details:
  [`docs/ai-check.md`](docs/ai-check.md#settings-from-remote-config).

## Privacy

- Gmail emails are read only while the side panel is open, and processed in the browser. The
  headers come from Gmail itself (the same page as ⋮ → Show original), with your normal login;
  no other server is involved.
- The rule checks run locally, without network access. The AI check of real emails runs only
  on the device (Gemini Nano).
- No email is stored: everything is gone when the side panel closes.
- Email content is shown only as text, never rendered as HTML, so pasted emails can't load
  tracking pixels or run scripts.
- The cloud deep check runs only when you ask for it and agree to the data shown: personal data
  is removed on the device first (addresses, numbers, IBANs, link paths; at privacy level "High"
  also names), raw headers are never sent, and you see what was removed and, under "Show what
  will be sent", exactly the email data that goes (besides PhishLocal's own instructions, which
  hold no personal data). Each email needs its own consent.
- To reach the cloud, the deep check needs an access token. After your click on "Send to the
  cloud", PhishLocal signs in anonymously with Firebase Authentication (an ID without name or
  email, kept in this browser profile) and asks PhishLocal's token server for a token that lasts
  30 minutes. That request carries the anonymous ID, never email content. The server counts the
  tokens per day: 10 per ID, 20 per IP address and 500 for all users together. It stores the IP
  address only as a keyed hash (HMAC with a random key for the day), never the address itself.
- Besides loading "Show original" from Gmail, the only request PhishLocal makes on its own: when
  the side panel opens, it asks Firebase Remote Config (Google) for its settings, at most every
  12 h after a successful answer (a failed one is tried again at the next opening).
  It holds a Firebase installation ID that stays the same for this browser profile, an
  installation token, the app ID, the SDK version, API key and project ID, and the browser
  language; when the
  installation is created or its token renewed (about weekly), also the SDK versions and the days
  the extension was used (Firebase's heartbeat header). Google also sees your IP address. Never
  email content.
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
   npm ci --prefix functions
   ```

2. **Configure Firebase:** copy [`.env.example`](.env.example) to `.env.local` and fill in the
   `VITE_FIREBASE_*` values of your Firebase web app. `.env.local` is git-ignored.
3. **For the cloud path (deep check), once per Firebase project:** set up the token server
   ([`functions/`](functions/)). A browser extension has no App Check attestation of its own
   (reCAPTCHA would load remote scripts), so a small Cloud Function signs the App Check tokens.
   1. Firebase console: switch the project to the **Blaze** plan (Cloud Functions need it). A new
      billing account may stay closed until a first prepayment (25 CHF on 22 Nov 2026; Cloud
      Billing support said so, the reopen button stayed disabled until then).
      Then cap the cost where it arises: Google Cloud console > Billing > Budgets & limits >
      create a budget with **enforced spending cap** for the service **Gemini API** (a cap covers
      one project and one service). The token server's limits count tokens, and a token allows
      any number of requests for its 30 minutes, so they slow abuse down but are no budget.
   2. With billing linked, the Gemini Developer API leaves the free tier and needs **prepaid
      credits**, separate from the Cloud Billing prepayment: AI Studio > Billing
      (`aistudio.google.com/billing?billing=<billing account ID>`) > buy credits, auto-reload off.
      Without them, cloud requests fail with "Your prepayment credits are depleted" (HTTP 429).
      New credits took a few minutes to apply.
   3. **Authentication** > Get started > Sign-in method: enable **Anonymous**.
   4. **Firestore Database** > Create database: production mode, location `europe-west6`
      (Zurich). It holds only the daily counters (they are never deleted; a TTL policy on
      `tokenLimits` can clear old days).
   5. Run `npm run firebase:login` once, then `npm run deploy:functions`. The script reads the
      project and app ID from `.env.local` and deploys the function and the Firestore rules. If
      it ends with "could not set up cleanup policy", run
      `npx firebase-tools@15.35.0 functions:artifacts:setpolicy --location europe-west6 --force`.
   6. Google Cloud console > IAM (tick "Include Google-provided role grants"): give the **Default
      compute service account** (`<project number>-compute@developer.gserviceaccount.com`) the
      role **Service Account Token Creator**, and enable the **IAM Service Account Credentials
      API**. The function signs the tokens with this account; without it, the function log says
      "Permission 'iam.serviceAccounts.signBlob' denied". The account exists after the first
      deploy, and the role took about a minute to apply.

   **Debug tokens (development and judging):** with `VITE_APPCHECK_DEBUG_TOKEN` (from App Check >
   Apps > Manage debug tokens) in `.env.local`, `npm run dev` skips the token server. It is a
   secret; release builds leave it out. `npm run build:judges` writes a build to `dist-judges/`
   with a second, separate debug token (`VITE_APPCHECK_JUDGES_TOKEN` in `.env.judges.local`),
   revoked after judging. That token passes App Check for the whole Firebase project, so share
   the judges build only privately (Devpost links and uploaded files are public).

4. **Enable Gemini Nano:** open `chrome://flags/#prompt-api-for-gemini-nano`, set it to "Enabled
   Multilingual", and restart Chrome. If the model is not on the device yet, the side panel shows
   a banner "Set up on-device AI" with a "Download now" button (about 4 GB, once).
5. **Build:** `npm run dev` (development build that rebuilds on changes) or `npm run build`
   (release build). Both write to `dist/`.
6. **Load the extension:** open `chrome://extensions`, turn on developer mode, click "Load
   unpacked" and choose `dist/`.

**Model load is slow?** On the dev machine, loads after a Chrome restart sometimes took minutes
while Chrome sat idle; a PC restart helped. See
[`docs/model-load-debugging.md`](docs/model-load-debugging.md).

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
| `src/token-server.ts`  | Token server client               |
| `functions/`           | Token server (Cloud Function)     |
| `tests/`               | Vitest tests                      |
| `docs/`                | Documentation                     |

How the project is built, and why: [`JOURNEY.md`](JOURNEY.md). Plan:
[`TIMETABLE.md`](TIMETABLE.md).

## License

[Apache-2.0](LICENSE)
