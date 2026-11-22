# Side panel design

The target design for the side panel. It started as a mockup agreed with Ricardo on 22 Nov 2026 and
was reviewed against the real states of the panel the same day; this file is the result, and the
spec for the "UI polish" task in `TIMETABLE.md`. It is the source of truth for wording, states and
decisions. Where the mockup differs, this file wins.

**Mockup:** <https://claude.ai/artifact/ToTPTrGLCAURFNT2JbF1dy> (a private canvas; only Ricardo's
account can open it, and Claude Code sessions signed in to that account can read it with the
Artifact tool). Each screen has its own link: add `#artboard-<name>` with the names in the state
table. The mockup shows the look of seven states; it uses made-up emails only. Known differences
from this file are listed under "Mockup review" at the end.

## Principles

- **Answer first.** The verdict is the first thing under the header. Details, links and the
  email itself come after it.
- **Overview first.** Three tiers, and each piece of information has exactly one tier:
  - **Tier 1, always visible:** the verdict word, one status line, what to do, whether the AI
    ran, whether the sender is verified, and (before anything is sent to the cloud) what is
    removed.
  - **Tier 2, one fold away:** the evidence behind a red flag, the links that no rule flagged,
    the exact data that will be sent.
  - **Tier 3, "Email details":** everything technical: headers, sender checks by name, how the AI
    and the rules agreed or disagreed, notes, the text.
- **Plain words.** Tier 1 and tier 2 say what to do, not how it was found: no "rules", "Gemini
  Nano", "DKIM", "DMARC" or "Authentication-Results" there. Technical names stay in tier 3. The
  empty, loading and download states may name the parts once ("Gemini Nano, built into Chrome"),
  to explain what happens on the device.
- **Privacy you can see.** "Checked on this device" appears wherever a result appears; the cloud
  is always an explicit step with its own consent, and nothing goes there before "Send".
- **Honest progress.** A percentage only where Chrome reports one (the model download). Waits
  without a known end show elapsed time and a moving bar, never a made-up percentage. One moving
  indicator per wait, not three.
- **Never colour alone.** Every state has a colour, a symbol and a word. Green is reserved for
  the verdict "Looks safe"; a ready model, a confirmed sender and other good news use neutral
  colours and words.
- **True claims only.** Every sentence in the panel must hold in every build: no "nothing is
  saved" while a setting is saved, no "Looks safe" when only the rules looked.
- **Own emails only.** Users check the emails they receive. Sample emails exist only in dev and
  judges builds (for the demo video and for judges whose inbox has no phishing).

## States

The panel is one column. Its parts show and hide by state; no part moves. The columns name the
mockup artboard where one exists.

| State                      | Mockup          | Tier-1 words                                                                                                                                                                   |
| -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No email, Gmail tab        | `Main`          | "Open an email in Gmail", "PhishLocal checks it here, automatically, while this panel is open. The email never leaves your browser."                                           |
| No email, other tab        | –               | "Open Gmail in this tab" and the hint to reload a Gmail tab that was open before the install                                                                                   |
| Email unreadable           | –               | "Could not read this email", "Gmail may have changed its page. You can paste the email instead."                                                                               |
| Model loading              | `Checking`      | Pill "On-device AI loading"; band "Checking…", step "Chrome is preparing Gemini Nano", elapsed time, info "The first check after Chrome restarts can take a few minutes", Stop |
| Model not downloaded       | –               | Banner "Set up on-device AI", "Chrome downloads Gemini Nano once, about 4 GB", button "Download now"                                                                           |
| Model downloading          | `Download`      | Pill "On-device AI 42%"; banner with the real percentage, "Rule checks already work while you wait"                                                                            |
| Model unavailable          | –               | Pill "AI not available"; banner "On-device AI is not available on this computer. Emails get the basic checks only."                                                            |
| Model failed to load       | –               | Pill "AI not loaded"; the band shows "Not checked by AI" for every email until a check loads it                                                                                |
| Checking, no red flags yet | `Checking`      | Band grey "Checking…", line "Basic checks done, AI check running"                                                                                                              |
| Checking, rules found some | –               | Band already yellow or red with the rules' verdict; the line says the AI check is still running                                                                                |
| Dangerous                  | `Dangerous`     | "Dangerous", "Don't click the links, don't reply, don't open attachments."                                                                                                     |
| Suspicious                 | –               | "Suspicious", "Some signs of phishing. Don't enter passwords or pay through this email."                                                                                       |
| Looks safe                 | `Safe`          | "Looks safe", "No signs of phishing found."                                                                                                                                    |
| Not checked by AI          | –               | Grey band, "No red flags found", "Not checked by AI. The basic checks alone can miss a well-written scam."                                                                     |
| Deep check offered         | `Dangerous`     | Button "Deep check in the cloud…", under it one line only when it is recommended or unavailable                                                                                |
| Consent, preparing         | –               | "Looking for names on this device…" with elapsed time and Stop; Send is not shown yet                                                                                          |
| Consent, preview           | `Consent`       | Level cards, chips of what was removed, "Never sent: …", fold "Show what will be sent", Send, Cancel                                                                           |
| Consent, names unchecked   | –               | Same, plus the warning "Some names may still be in the text: read it before you send."                                                                                         |
| Sending                    | –               | "Checking in the cloud…" with elapsed time and Stop                                                                                                                            |
| Cloud result               | –               | A second band "Deep check: Dangerous / Suspicious / Looks safe" with reasons and advice; "Sent once: the data above."                                                          |
| Cloud failed               | –               | "The deep check did not work (short reason). The result above still applies."                                                                                                  |
| Email changed meanwhile    | –               | The five messages in `deep-check-view.ts` (`CHANGED`), in the consent's status line                                                                                            |
| Dark mode                  | `DangerousDark` | Same words, dark tokens                                                                                                                                                        |

"Basic checks" is the tier-1 name for the rule checks. "AI" is the tier-1 name for the on-device
model; "Gemini Nano" appears only in the empty, loading and download texts and in tier 3.

## Layout, top to bottom

Every part is its own component (see "How to build it"); the page sets the spacing between them.

1. **Top bar** (always): logo, "PhishLocal", and the model pill on the right. The pill is
   neutral (grey) in every state: a dot when ready, a spinner while loading or downloading, a
   small "!" when the AI is not available or not loaded. Words: "On-device AI ready", "On-device
   AI loading", "On-device AI 42%", "AI not available", "AI not loaded".
2. **Model banner** (only when the model needs the user): not downloaded (text and the
   "Download now" button), downloading (progress bar with `role="progressbar"`), unavailable
   (text only). It never replaces the email below it.
3. **Empty card** (only without an email): illustration, heading, text, the outlined button
   "Paste an email", then "How your privacy is kept" with three points, then the footer line
   "Languages: en · de · fr · es · it · pt" and a "How it works" button that opens the README.
4. **Email strip** (with an email): subject (one line, cut with "…"), then the sender: the
   address domain first and bold, the display name after it in grey, the full address on its own
   line, wrapping, never cut. Third line, the sender status: "Sender confirmed by Gmail" (DMARC
   pass from `mx.google.com`), "Sender confirmed by your mail server" (pass from another server
   in pasted raw source), "Sender not verified" (no headers, or no pass), "Checking the sender…"
   (Gmail headers still loading). On the right an icon button "Check the open email again".
   Under the strip one muted line for the source status ("Checked automatically", "Pasted
   email", "Sample loaded: …") and errors.
5. **Verdict band:** a tinted head with a round symbol, the verdict word and one status line;
   then the reasons (up to five, as the AI gives them), the "What to do" box, and the footer
   "Checked on this device · Done in 1.4 s". While the AI check runs, the footer shows the
   elapsed time and the Stop button instead.
6. **Red flags** (heading with a count), one card per danger or warning finding: a badge
   ("Danger" or "Warning"), the finding's title in plain words, then the evidence: "Says" and
   "Opens" rows for link findings, quoted phrases as chips, otherwise the finding's sentence. The
   count counts danger and warning findings only. Hidden when there are none.
7. **Links** (heading with a count): one card per flagged link (the real domain bold, "forwards
   to" when it does, the shortened URL in monospace, the border in the link's severity), then a
   fold "N more links" with the unflagged ones in the same form. Link texts appear only in the
   red-flag cards ("Says"), never twice.
8. **Deep check:** one outlined button "Deep check in the cloud…" under the links. Filled (blue)
   only when recommended: the AI did not run, or the UI language is one where its answers are
   experimental (it, pt). Disabled with the line "Not available in this build" when the build has
   no App Check. Clicking it opens the consent section in place (the strip and the band stay
   visible; red flags and links are hidden while it is open), with "Back to the result" to close
   it.
9. **"Email details"** (a `<details>` fold): From, Subject, Sender checks (SPF, DKIM, DMARC by
   name), Reply-To, Return-Path, "AI and basic checks" (how the verdict was combined, the AI's
   own level when the rules were stricter, "the AI's notes" for a confirmed sender), Notes (the
   `info` findings), Text.
10. **"Check another email"** (a `<details>` fold): the paste form (From, Subject, Email text,
    "Use pasted email", "Clear") and, in dev and judges builds only, the sample row. "Paste an
    email" on the empty card opens this fold and focuses the text field.
11. **Developer tools** (dev builds only): the test prompt, "Force cloud", "Run prompt".

The page is one column, 16 px side padding, 12 px between parts. It must work from 320 px wide
without sideways scrolling.

### The consent section

- Heading "Deep check in the cloud", text "A larger model in the cloud checks again. Personal
  data is removed on this device first." and "Nothing has been sent yet."
- **Privacy level:** two radio cards. Clicking anywhere on a card selects it (the card forwards
  the click to its radio; the list is not inside the `<label>`). The selected card has an accent
  border and tint.
  - **Standard** – "Removes:" Email addresses; Phone, card, account and customer numbers; IBANs;
    Link paths (the website's name stays).
  - **High** – "Removes:" Everything from Standard; **Names of people** (bold).
  - Default Standard, remembered in the browser. Changing the level rebuilds the data at once;
    at High that starts the name search.
- **While preparing** (High only): one line "Looking for names on this device… 0:07", a Stop
  button; the chips, the fold and Send are not shown. Standard needs no search: its data shows at
  once.
- **Preview:** chips "1 name", "2 email addresses", "1 number", "1 link path" (or "No personal
  data found"), the line "Never sent: your address, the raw headers, server IP addresses.", when
  names could not be checked the warning "Some names may still be in the text: read it before
  you send.", then the fold **"Show what will be sent"** (a button with `aria-expanded`, closed
  by default) with the JSON, monospace, scrollable, exactly the text that is sent, no
  highlighting (a highlight built from the text could mark an attacker's own "[name]" as removed).
- Buttons: **"Send to the cloud"** (filled, cloud icon), **"Cancel"** (outlined), full width.
  Below: "Sent once, for this check only, to Gemini through Firebase AI Logic."
- **Sending:** "Checking in the cloud… 0:03" and Stop; Send and Cancel are gone; the data stays.
- **Result:** a second band "Deep check: …" with the cloud's reasons and advice, the footer
  "Checked in the cloud · Done in 1.9 s", and the status "Sent once: the data above." The data
  fold stays as the record. The button "Deep check in the cloud…" is available again.

## Wording

Tier-1 texts. The same thing has the same name everywhere.

| Thing                       | Words                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| Verdict words               | Checking… / Dangerous / Suspicious / Looks safe / No red flags found                       |
| Dangerous line              | Don't click the links, don't reply, don't open attachments.                                |
| Suspicious line             | Some signs of phishing. Don't enter passwords or pay through this email.                   |
| Looks safe line             | No signs of phishing found.                                                                |
| Not checked by AI           | Not checked by AI. The basic checks alone can miss a well-written scam.                    |
| AI running line             | Basic checks done, AI check running (or: Basic checks found red flags, AI check running)   |
| Result footer               | Checked on this device · Done in 1.4 s                                                     |
| Cloud result footer         | Checked in the cloud · Done in 1.9 s                                                       |
| Sender status               | Sender confirmed by Gmail / Sender not verified / Checking the sender…                     |
| The rule checks             | basic checks (tier 1 and 2); "rule checks" in tier 3 and in the docs                       |
| The on-device model         | AI, on-device AI; "Gemini Nano" in the empty, loading, download texts and tier 3           |
| Deep check button           | Deep check in the cloud…                                                                   |
| Privacy levels              | Standard / High; "Names of people"                                                         |
| Data fold                   | Show what will be sent                                                                     |
| Cloud send                  | Send to the cloud / Cancel / Stop                                                          |
| After sending               | Sent once: the data above.                                                                 |
| Paste                       | Paste an email (empty card), Check another email (fold), Use pasted email, Clear           |
| Refresh                     | Check the open email again                                                                 |
| Privacy points (empty card) | Checked on this device / No email is saved / Cloud only if you ask                         |
| Not                         | Get a second opinion, Prepare a deep check…, AI loading, Checked 2:14 PM, Nothing is saved |

### Red-flag titles

Plain-word titles per rule, for the red-flag cards; the rule's sentence stays in tier 3 and in
the prompt. `info` findings are notes in "Email details" and have no card.

| Rule                   | Title                                              | Evidence shown                       |
| ---------------------- | -------------------------------------------------- | ------------------------------------ |
| `dangerous-link`       | A link runs code instead of opening a page         | the link's scheme                    |
| `hidden-link-target`   | A link hides where it really goes                  | Opens: real host                     |
| `ip-link`              | A link goes to a bare number address               | Opens: the IP address                |
| `international-domain` | A web address uses letters from another alphabet   | the host                             |
| `link-text-mismatch`   | A link doesn't go where its text says              | Says: link text · Opens: real domain |
| `lookalike-domain`     | A web address imitates a known one                 | the domain and the one it imitates   |
| `brand-in-subdomain`   | A known name is used in front of another address   | the host                             |
| `brand-in-domain`      | A web address contains a known name but isn't it   | the domain                           |
| `sender-name-domain`   | The sender's name doesn't match the address        | Name says · Address is               |
| `sender-name-brand`    | The sender claims a brand from another address     | Name says · Address is               |
| `hidden-characters`    | Words contain invisible characters                 | the words                            |
| `mixed-script`         | Words mix letters from different alphabets         | the words                            |
| `direction-override`   | Text is written backwards to disguise an address   | the finding's sentence               |
| `reply-to-mismatch`    | Replies would go to a different company            | the Reply-To domain                  |
| `dmarc-fail`           | The sender's address is forged                     | the finding's sentence               |
| `auth-fail`            | The sender's mail server didn't confirm this email | the finding's sentence               |
| `incomplete-check`     | Part of this email could not be checked            | the finding's sentence               |
| `credentials`          | Asks for passwords, identity or card details       | quoted phrases                       |
| `payment`              | Asks for a payment                                 | quoted phrases                       |
| `urgency` (info)       | Time pressure                                      | quoted phrases (tier 3)              |
| `threat` (info)        | Threatens consequences                             | quoted phrases (tier 3)              |
| `redirect-link` (info) | A link goes through a forwarding service           | the service's host (tier 3)          |
| `dkim-other-domain`    | Signed by another domain                           | tier 3                               |
| `no-auth-results`      | No sender checks in this email                     | tier 3                               |

## Visual system

Define these as custom properties on `:root`, with the dark values under
`@media (prefers-color-scheme: dark)`. Font: `system-ui` (no web font: nothing remote).

**Type:** 12 / 13 / 14 (body) / 15 / 18 px, line height 1.45; weights 400, 600 and 700 only.
**Space:** 4 / 8 / 12 / 16 / 24 px. **Radii:** cards 12 px, buttons and boxes 8 px, pills and
badges round. **Buttons:** 40 px high (44 px for Send and Cancel), one filled button per screen
at most, a visible `:focus-visible` ring. **Icons:** one stroke width (2 px on a 24 px grid),
drawn as SVG files and shown through CSS `mask-image`, so the panel's DOM holds no `<svg>` and
email text can never become one. No emoji.

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
| accent-tint    | `#EEF3FE` | `#1C2A47` | info boxes, chips                     |
| selected-tint  | `#F3F7FF` | `#1A2740` | selected privacy level                |
| danger         | `#B42318` | `#E5484D` | symbols, fills                        |
| danger-text    | `#8F1D14` | `#FFB4AB` | verdict word, badge text              |
| danger-tint    | `#FDEEEC` | `#3A1D1B` | verdict band, badge                   |
| danger-border  | `#F2C4BE` | `#5C2A25` | verdict, red-flag and link cards      |
| warning        | `#8A5300` | `#FFD58A` | symbol                                |
| warning-text   | `#7A4A00` | `#FFD58A` | badge text                            |
| warning-tint   | `#FFF4DE` | `#3A2E14` | badge                                 |
| warning-border | `#EBCB8B` | `#5A4720` | cards                                 |
| safe           | `#1E7A3C` | `#4CC27A` | symbols                               |
| safe-text      | `#155C2C` | `#8FD6A5` | verdict word                          |
| safe-tint      | `#EAF6EE` | `#17321F` | verdict band                          |
| safe-border    | `#BFE3CB` | `#2A5236` | verdict card                          |
| pending        | `#6B737D` | `#8A939D` | "Checking…" and "unchecked" symbol    |
| pending-tint   | `#F0F2F5` | `#232930` | "Checking…" band, loading pill, chips |

Every pair is measured before use (text 4.5:1, symbols and meaningful borders 3:1); the
measurements live as comments in `style.css`.

## How to build it

- Plain HTML, CSS and TypeScript; no component library, no new dependency.
- **CSS architecture:** cascade layers `tokens, base, layout, components, states`. Tokens have
  semantic names (`--color-danger-text`, `--space-3`), never raw hex outside the tokens layer.
  Components are classes with a prefix per component (`.band`, `.band__word`, `.flag`,
  `.pill`), low specificity (`:where()` where needed), no outer margins: the parent sets the gap
  (`.stack` and `.row` primitives). A component never styles the inside of another component, no
  descendant selectors across components, no `:last-child` margin tricks, no fixed heights on
  text. Flex children that hold email text get `min-width: 0` and `overflow-wrap: anywhere`.
  That is what lets a later edit on one component leave the others' spacing alone.
- **Modules:** each part keeps a `create…(elements, deps)` function with the elements it owns
  passed in, as today; a part never queries the DOM of another part. Shared DOM helpers (`el()`,
  `setText()`, icons by name) live in `src/sidepanel/ui.ts`.
- Icons: SVG files in `src/sidepanel/icons/`, shown through CSS `mask-image` on a `.icon` span.
  Never build SVG from a string (`innerHTML` is forbidden in `src/`).
- Folding: native `<details>` for "Email details", "Check another email" and "N more links"; a
  button with `aria-expanded` for "Show what will be sent".
- External links (README) open with `chrome.tabs.create`, so the panel's DOM holds no `<a>`.
- Keep the element IDs that `main.ts` and the tests use where possible; a new button or state
  belongs in the monkey tests' move lists and promises (see `CLAUDE.md`).
- Dev-only parts (test prompt, sample row) stay in `index.html` with `hidden` and are shown by
  `main.ts` in the right builds, so the tests see the same page.
- The extension gets icons in `manifest.json`: 16, 32, 48 and 128 px PNGs rendered from the logo
  SVG (blue rounded square, white shield and check mark).

## Decisions (22 Nov 2026)

1. **The exact data is folded, what was removed is not.** The user sees the chips and the
   "Never sent" line before consenting; the JSON is one click away. `CLAUDE.md`,
   `docs/ai-check.md` and `JOURNEY.md` say so.
2. **Sample emails** only in dev and judges builds.
3. **One deep check button** on every result, outlined; filled only when recommended.
4. **Empty heading** "Open an email in Gmail" stays; two more variants for other tabs and
   unreadable emails.
5. **Default privacy level** Standard.
6. **Download progress:** measure whether Chrome also sends 0 % and 100 % when the model is
   already downloaded; show the bar only once a value between them arrived.
7. **The result after sending** is a second band under the consent section.
8. **Plain words in the AI's reasons** (screen `Safe` names SPF, DKIM and DMARC) is a prompt
   question for the tuning task.
9. **No sample emails and no "How it works" link as `<a>`:** the monkey test keeps its promise
   that the panel's DOM holds no `a`, `svg`, `img` or `template`.

## Mockup review

What the mockup shows and this file changes, so that nobody builds from the mockup alone:

- The email strip puts the display name first and cuts the address: here the domain comes first.
- `Dangerous` shows "Link text and real target differ" as Danger and "Time pressure" as Warning;
  in the code they are warning and info.
- `Safe` shows two links in one card; here one card per link, unflagged links folded.
- `Dangerous` has a filled blue deep check row, `Safe` a text button, `DangerousDark` an older
  outlined block; here one outlined button.
- `Consent` shows the data at once and has no preparing, sending or result state; it also drops
  the email strip.
- The header pill is green; here neutral.
- `Main` says "Nothing is saved"; here "No email is saved".
- Missing in the mockup: Suspicious, "No red flags found (not checked by AI)", model unavailable,
  model not downloaded, the paste form, the cloud result.
