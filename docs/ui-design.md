# Side panel design

The target design for the side panel, agreed with Ricardo on 22 Nov 2026 in a mockup. It is the
spec for the "UI polish" task (Mon 23 Nov in `TIMETABLE.md`). The code does not follow it yet.

**Mockup:** <https://claude.ai/artifact/ToTPTrGLCAURFNT2JbF1dy> (a private canvas; only
Ricardo's account can open it, and Claude Code sessions signed in to that account can read it with
the Artifact tool). Each screen has its own link: add `#artboard-<name>` with the names below.
Screen 5 can be clicked through (`#play-Consent`). The mockup uses made-up emails only.

This file is the source of truth for wording and decisions; the mockup shows the look. Where they
differ, this file wins, and the difference belongs in "Open points" below.

## Principles

- **Answer first.** The verdict is the first thing under the header. Details, links and the
  email itself come after it, folded where they are long.
- **Plain words.** Users see what to do, not how it works: no "rules", "Gemini Nano", "DKIM" or
  "Authentication-Results" in the main view. Technical terms stay in "Email details".
- **Privacy you can see.** "On this device" appears where a result appears; the cloud is always
  an explicit step with its own screen.
- **Honest progress.** A percentage only where Chrome reports one (the model download). Waits
  without a known end show elapsed time and a moving bar, never a made-up percentage.
- **Never colour alone.** Every state has a colour, a symbol and a word.
- **Own emails only.** Users check the emails they receive; the panel does not offer sample
  emails (see "Open points" for the demo and the judges).

## Screens

| #   | Mockup name     | State                                                                     |
| --- | --------------- | ------------------------------------------------------------------------- |
| 1   | `Main`          | Empty: no email open                                                      |
| 2   | `Checking`      | Rules done, on-device AI still loading (the long first load)              |
| 3   | `Dangerous`     | Result: dangerous, with red flags and links                               |
| 4   | `Safe`          | Result: looks safe                                                        |
| 5   | `Consent`       | Deep check in the cloud: privacy level and consent (clickable)            |
| 6   | `DangerousDark` | Screen 3 in dark mode                                                     |
| 7   | `Download`      | First model download with a real percentage (the mockup animates 0–100 %) |

### Layout, top to bottom

1. **Header** (on every screen): logo, "PhishLocal", and a status pill on the right:
   - "On-device AI ready" (green dot);
   - "On-device AI loading" (spinner) while the model loads;
   - "On-device AI 42%" (spinner) while the model downloads.
2. **Email strip**: subject (one line, cut with "…"), then sender name · address (one line),
   and an icon button "Check the open email again" (refresh icon, `aria-label`).
3. **Verdict card**: a tinted top band with a round symbol and the verdict word, one line below
   it; then the reasons, a "What to do" box and a footer line. Details below.
4. **Red flags** (heading with a count badge), one card per finding.
5. **Links** (heading with a count badge), one card per link.
6. **Deep check** button.
7. **"Email details"** and **"Check another email"**, both folded (`<details>`).

The page is one column, 16 px side padding, 12 px between blocks. It must work from 320 px wide
without sideways scrolling.

### Screen 1: empty

- Illustration (envelope with a shield), heading "Open an email in Gmail", text "PhishLocal
  checks it here, automatically, while this panel is open. The email never leaves your browser."
- One outlined button: **"Paste an email"**. No sample button.
- "How your privacy is kept", three points with icons:
  - **Checked on this device** – "Rule checks plus Gemini Nano, built into Chrome. Works
    offline."
  - **Nothing is saved** – "Close the panel and all reading stops."
  - **Cloud only if you ask** – "Personal data is removed first, and you see exactly what is
    sent."
- Footer: "Languages: en · de · fr · es · it · pt" and a "How it works" link.

### Screen 2: checking

- Verdict card in grey: "Checking…", below it "Rules first, then the on-device AI".
- Two steps:
  - ✓ "Rule checks" – "No red flags found" – "0.1 s" on the right;
  - spinner "On-device AI" – "Chrome is preparing Gemini Nano" – a moving (indeterminate) bar –
    elapsed time on the right ("2:14", counting up).
- Info box: "The first check after Chrome restarts can take a few minutes."
- Full-width outlined button **"Stop"**.
- If the rules found a danger, the card is already red (the rules are the AI's lower limit);
  the grey card is only for "rules found nothing".
- Under "reduce motion" the bar and spinners stand still.

### Screens 3, 4 and 6: result

- Verdict band: **Dangerous** – "Don't click the links and don't reply." / **Suspicious** /
  **Looks safe** – "No signs of phishing found."
- Reasons: up to three short sentences from the AI (dangerous: bullets; safe: green check marks).
- "What to do" box (lightbulb icon), one sentence.
- Footer line: lock icon and **"Checked on this device"** on the left, **"Done in 1.4 s"** on the
  right (the check's duration, not the time of day).
- **Red-flag cards**: a badge ("Danger" or "Warning", with a symbol), the finding's title, then
  the evidence:
  - link text vs target as two rows, "Says" and "Opens" (target in bold, danger colour);
  - quoted phrases as grey chips ("within 24 hours");
  - the card's border has the badge's colour (danger or warning).
- **Link cards**: warning triangle (when flagged), the real domain in bold and large, "Shown as:
  …" below, then the shortened URL in monospace. The border follows the link's own mark: danger,
  warning, or grey for an unflagged link.
- **Deep check**: on screen 3 a full-width blue button row: cloud icon, **"Deep check in the
  cloud…"**, arrow on the right; the whole row is one `<button>`. No description next to it (the
  description is on screen 5).

### Screen 5: deep check in the cloud

- "← Back to the result", heading **"Deep check in the cloud"**.
- Text: "A larger model in the cloud checks again. Personal data is removed on this device
  first, and you can see the exact data before anything is sent." Then: "Nothing has been sent
  yet. Choose how much to remove, then decide."
- **Privacy level**: two cards, each a radio button with a title and a list. The selected card
  has a blue border and a light blue background.
  - **Standard** – "Removes:" Email addresses; Phone, card, account and customer numbers; IBANs;
    Link paths (the website's name stays).
  - **High** – "Removes:" Everything from Standard; **Names of people** (bold).
  - Only the radio button and the title select a card (a list inside a `<label>` is not valid
    HTML).
- **"Show what will be sent"**: a button with `aria-expanded`, closed by default; it opens:
  - "Removed on this device" with counts as chips ("1 name", "1 email address", …);
  - "Never sent: your address, the raw headers, server IP addresses.";
  - "Exactly this will be sent": the JSON, monospace, scrollable, with the placeholders
    (`[name]`, `[email]`, `[number]`, `[link: …]`) highlighted;
  - "Highlighted: what was replaced on this device."
- Buttons: **"Send to the cloud"** (filled blue, cloud icon), **"Cancel"** (outlined), both full
  width. Below: "Sent once, for this check only, to Gemini through Firebase AI Logic."

### Screen 7: first model download

- Card "Setting up on-device AI": "Chrome downloads Gemini Nano once, about 4 GB. After that,
  checks run on this device, also offline."
- A progress bar with the real percentage (`downloadprogress`, `event.loaded` 0–1, already read
  by `downloadOnDeviceModel()` in `src/ai.ts`), `role="progressbar"` with `aria-valuenow`.
- Info box: "Rule checks already work while you wait. You can keep using Gmail."

## Wording

The same thing has the same name everywhere:

| Use                      | Not                                             |
| ------------------------ | ----------------------------------------------- |
| Deep check in the cloud… | Get a second opinion, Prepare a deep check…     |
| Show what will be sent   | Advanced: show the data that will be sent       |
| On-device AI loading     | AI loading                                      |
| Checked on this device   | Checked on this device · rules + Gemini Nano    |
| Done in 1.4 s            | Checked 2:14 PM                                 |
| Names of people          | Names of people, found by Gemini Nano on this … |
| Paste an email           | Not in Gmail? Paste an email; Try a sample      |

## Visual tokens

Define these as custom properties on `:root`, with the dark values under
`@media (prefers-color-scheme: dark)`. Font: `system-ui` (no web font: nothing remote). Text
sizes 12 / 13 / 14 (body) / 15 / 18–19 px; weights 400, 600, 650–700.

| Token          | Light     | Dark      | Use                                   |
| -------------- | --------- | --------- | ------------------------------------- |
| background     | `#F5F6F8` | `#111418` | page                                  |
| surface        | `#FFFFFF` | `#1A1E24` | cards, header                         |
| border         | `#E2E5EA` | `#2C323A` | cards                                 |
| border-strong  | `#CBD2DA` | `#3A414A` | outlined buttons                      |
| text           | `#16191D` | `#E8EAED` | body                                  |
| text-secondary | `#4A525C` | `#B0B8C1` | descriptions                          |
| text-muted     | `#5A626C` | `#9AA3AD` | meta lines, labels                    |
| accent         | `#1A56DB` | `#8AB4FF` | buttons (light), links, focus         |
| accent-tint    | `#EEF3FE` | –         | info boxes, chips                     |
| selected-tint  | `#F3F7FF` | –         | selected privacy level                |
| danger         | `#B42318` | `#E5484D` | symbols, fills                        |
| danger-text    | `#8F1D14` | `#FFB4AB` | verdict word, badge text              |
| danger-tint    | `#FDEEEC` | `#3A1D1B` | verdict band, badge                   |
| danger-border  | `#F2C4BE` | `#5C2A25` | verdict, red-flag and link cards      |
| warning        | `#8A5300` | `#FFD58A` | symbol                                |
| warning-text   | `#7A4A00` | `#FFD58A` | badge text                            |
| warning-tint   | `#FFF4DE` | `#3A2E14` | badge                                 |
| warning-border | `#EBCB8B` | `#5A4720` | cards                                 |
| safe           | `#1E7A3C` | `#4CC27A` | symbols, dot                          |
| safe-text      | `#155C2C` | `#8FD6A5` | verdict word, pill text               |
| safe-tint      | `#EAF6EE` | `#17321F` | verdict band, pill                    |
| safe-border    | `#BFE3CB` | –         | verdict card                          |
| pending        | `#6B737D` | –         | "Checking…" symbol                    |
| pending-tint   | `#F0F2F5` | –         | "Checking…" band, loading pill, chips |

"–": not drawn in the mockup yet; pick a value when implementing. The contrast of every pair has
not been measured: check each one (text 4.5:1, symbols and meaningful borders 3:1) before using
it, as `style.css` does today for the traffic light.

Shapes: cards 12 px corners, buttons and boxes 8 px, badges and pills fully round. Buttons are
40 px high (44 px on screen 5), with a visible `:focus-visible` ring. Icons are simple stroke
icons (24-unit grid, 1.8–2.2 stroke).

## How to build it

- Plain HTML, CSS and TypeScript as today; no component library and no new dependency.
- Icons: static inline `<svg>` in `index.html`, or CSS `mask-image` with a bundled file. Never
  build SVG from a string (`innerHTML` is forbidden in `src/`).
- Placeholder highlighting in the JSON: split the text and build `<span>` elements with
  `textContent`; the JSON text itself must stay exactly what is sent.
- Folding: native `<details>` for "Email details" and "Check another email"; a button with
  `aria-expanded` for "Show what will be sent".
- Keep the element IDs that `main.ts` and the monkey tests use where possible; a new button or
  state belongs in the monkey tests' move lists (see `CLAUDE.md`).
- The test prompt section ("Test prompt", "Run prompt") is still visible in production builds
  (only "Force cloud" is hidden); show it in dev builds only.
- The extension has no icons in `manifest.json` yet: add 16, 32, 48 and 128 px versions of the
  logo (blue rounded square with a white shield and check mark).

## Open points

1. **"Show what will be sent" is closed by default.** `CLAUDE.md`, `docs/ai-check.md` (step 5,
   "the panel shows exactly that data") and `JOURNEY.md` ("Showing the exact data before sending
   covers the miss") promise that the user sees the data before consenting. With the fold, a user
   can send without looking. Decide before implementing; if the fold stays, update those three
   files. Either way, a warning that names may remain (after the 20 s limit or without the model)
   must stay visible outside the fold.
2. **Sample emails:** hidden from users. Not decided yet: keep them in dev and judges builds for
   the demo video and for judges whose inbox has no phishing (`TIMETABLE.md`: "demo must always
   work").
3. **Screen 6 and screen 4** still show the older deep check button (screen 6: icon above an
   outlined button; screen 4: a text button). Decide whether both get screen 3's blue row; on a
   safe email a strong blue button may pull attention from "Looks safe".
4. **Screen 1:** only the paste button was changed; the heading "Open an email in Gmail" is still
   there. Confirm.
5. **Default privacy level:** the mockup shows High selected as an example; the code's default
   (Standard, remembered in `localStorage`) stays unless decided otherwise.
6. **Download progress:** measure whether Chrome also sends 0 % and 100 % when the model is
   already downloaded before the panel relies on it.
7. **The result after sending** (the sent data stays on screen as the record, `docs/ai-check.md`)
   is not in the mockup yet.
