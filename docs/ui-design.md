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
- **Never colour alone.** Every state has a colour, a symbol and a word. Green fills only the
  verdict "Looks safe"; elsewhere it is at most the small dot of a ready model. A confirmed sender
  and other good news use neutral colours and words.
- **True claims only.** Every sentence in the panel must hold in every build: no "nothing is
  saved" while a setting is saved, no "Looks safe" when only the rules looked.
- **Own emails only.** Users check the emails they receive. Sample emails exist only in dev and
  judges builds (for the demo video and for judges whose inbox has no phishing).

## States

The panel is one column. Its parts show and hide by state; no part moves. The columns name the
mockup artboard where one exists.

| State                      | Mockup                                                                  | Tier-1 words                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No email, Gmail tab        | `Main`                                                                  | "Open an email in Gmail", "PhishLocal checks it here, automatically, while this panel is open. The email never leaves your browser."                                           |
| No email, other tab        | –                                                                       | "Open Gmail in this tab" and the hint to reload a Gmail tab that was open before the install                                                                                   |
| Email unreadable           | –                                                                       | "Could not read this email", "Gmail may have changed its page. You can paste the email instead."                                                                               |
| Model loading              | `Checking`                                                              | Pill "On-device AI loading"; band "Checking…", step "Chrome is preparing Gemini Nano", elapsed time, info "The first check after Chrome restarts can take a few minutes", Stop |
| Model not downloaded       | –                                                                       | Banner "Set up on-device AI", "Chrome downloads Gemini Nano once, about 4 GB", button "Download now"                                                                           |
| Model downloading          | `Download`                                                              | Pill "On-device AI 42%"; banner with the real percentage, "Rule checks already work while you wait"                                                                            |
| Model unavailable          | –                                                                       | Pill "AI not available"; banner "On-device AI is not available on this computer. Emails get the basic checks only."                                                            |
| Model failed to load       | –                                                                       | Pill "AI not loaded"; the band shows "Not checked by AI" for every email until a check loads it                                                                                |
| Checking, no red flags yet | `Checking`                                                              | Band grey "Checking…", line "Basic checks done, AI check running"                                                                                                              |
| Checking, rules found some | –                                                                       | Band already yellow or red with the rules' verdict; the line says the AI check is still running                                                                                |
| Dangerous                  | `Dangerous`                                                             | "Dangerous", "This looks like phishing."; the advice box says what to do                                                                                                       |
| Suspicious                 | –                                                                       | "Suspicious", "Be careful: some signs of phishing."; the advice box says what to do                                                                                            |
| Looks safe                 | `Safe`                                                                  | "Looks safe", "No signs of phishing found."                                                                                                                                    |
| Not checked by AI          | Not checked by AI. The basic checks alone can miss a well-written scam. |
| Deep check offered         | `Dangerous`                                                             | Button "Deep check in the cloud…", under it one line only when it is recommended or unavailable                                                                                |
| Consent, preparing         | –                                                                       | "Looking for names on this device…" with elapsed time and Stop; Send is not shown yet                                                                                          |
| Consent, preview           | `Consent`                                                               | Level cards, chips of what was removed, "Never sent: …", fold "Show what will be sent", Send, Cancel                                                                           |
| Consent, names unchecked   | –                                                                       | Same, plus the warning "Some names may still be in the text: read it before you send."                                                                                         |
| Sending                    | –                                                                       | "Checking in the cloud…" with elapsed time and Stop                                                                                                                            |
| Cloud result               | –                                                                       | A second band "Deep check: Dangerous / Suspicious / Looks safe" with reasons and advice; "Sent once: the data above."                                                          |
| Cloud failed               | –                                                                       | "The deep check did not work (short reason). The result above still applies."                                                                                                  |
| Email changed meanwhile    | –                                                                       | The five messages in `deep-check-view.ts` (`CHANGED`), in the consent's status line                                                                                            |
| Dark mode                  | `DangerousDark`                                                         | Same words, dark tokens                                                                                                                                                        |

"Basic checks" is the tier-1 name for the rule checks. "AI" is the tier-1 name for the on-device
model; "Gemini Nano" appears only in the empty, loading and download texts and in tier 3.

## Layout, top to bottom

Every part is its own component (see "How to build it"); the page sets the spacing between them.

1. **Top bar** (always): logo (a 56 px PNG of `design/logo.svg`, shown at 28 px as a CSS
   background), "PhishLocal", and the model pill on the right. The pill is
   grey in every state, with a green dot when ready (decided 22 Nov 2026: users read a grey dot
   as "not ready"; a soft green halo swells and fades around it every 2.4 s, the dot keeps its
   colour, and it stands still with reduced motion), a grey spinner while loading or downloading, a small "!" when the AI is
   missing. Words: "On-device AI ready", "On-device AI loading" (with
   the elapsed time, which gives way on panels under 360 px), "On-device AI 42%", "AI not set
   up" (not downloaded), "AI not available", "AI not loaded".
2. **Model banner** (only when the model needs the user): not downloaded (text and the
   "Download now" button), downloading (progress bar with `role="progressbar"`), unavailable
   (text only). It never replaces the email below it.
3. **Empty state** (only without an email): heading, text, the outlined button "Paste an
   email", then "How your privacy is kept" with three points (icon, bold lead, one sentence), then
   a footer with the flag button on the left and "How it works" (opens the README) on the right.
   The flag button shows the flag of the panel's language and opens the language menu above it
   (a popover: Esc or a click outside closes it): every language as its flag and its own name,
   the current one marked; choosing another saves it and reloads the panel (decided 23 Nov 2026,
   in place of the line "Languages: en · de · fr · es · it · pt"). Left-aligned, no
   illustration: the panel is too narrow for a hero, and the logo is already in the top bar.
4. **Email strip** (with an email): subject (one line, cut with "…"), then the sender: the
   address domain first and bold, the display name after it in grey, the full address on its own
   line, wrapping, never cut. Third line, the sender status: "Sender confirmed by Gmail" (DMARC
   pass from `mx.google.com`, read from Gmail's own page), "Sender confirmed by your mail
   server" (pass in pasted raw source, whatever server it names: pasted text is not Gmail's word),
   "Sent from your own address" (`EmailHeaders.sentToSelf`: no sender checks at all, and the
   sender is the mailbox the email was delivered to), "Sender not confirmed" (no headers, or no
   pass), "Checking the sender…" (Gmail headers still loading). On the right an icon button "Check the open email again".
   Under the strip one muted line, only when it says something the strip and the band do not
   (decided 22 Nov 2026): "Pasted email." / "Pasted email with its headers.", "Sample loaded:
   …", "Could not load the sender checks: …", "The email is long: only the first part was
   checked.", and errors. A Gmail email whose sender checks loaded has no line: the strip says
   who confirmed the sender, the band's footer where it was checked.
5. **Verdict band:** a tinted head with a round symbol, the verdict word and one status line;
   then the reasons (up to five, as the AI gives them), the "What to do" box (a gold bulb that
   glows like the ready dot), and the footer
   "Checked on this device · Done in 1.4 s". While the AI check runs, the footer shows the
   elapsed time and the Stop button instead.
6. **Red flags** (heading "Red flags (3)", the count as text): one list in one card, one row per
   danger or warning finding, rows separated by a hairline: a badge ("Danger" or "Warning", with
   its symbol), the finding's title in plain words, then the evidence: "Says" and "Opens" rows
   for link findings, "Looks like" and "Is" for lookalike domains, quoted phrases as chips,
   otherwise the finding's sentence. The badge alone carries the severity; rows have no coloured
   borders (a coloured bar on every row emphasises nothing). The count counts danger and warning
   findings only. Hidden when there are none.
7. **Links** (heading "Links (2)"): one list in one card, one row per flagged link (its badge,
   the real domain bold, "forwards to" when it does, the shortened URL in monospace), then a fold
   "N more links" with the unflagged ones in the same form. Without a flagged link the heading
   gives way and the fold itself is titled "Links (3)", so the count is said once. Link texts
   appear only in the red-flag rows ("Says"), never twice.
8. **Deep check:** one outlined button "Deep check in the cloud…" under the links. Filled (blue)
   only when recommended: the AI did not run, or the panel's language is one where on-device
   answers are experimental (it, pt; not the case for the English panel). Disabled with the line "Not available in this build" when the build has
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
11. **Settings** (a `<details>` fold): "Language", a menu with "Automatic (Deutsch)" first
    (Chrome's language, else English) and then each language in its own name (English, Deutsch,
    Français, Español, Italiano, Português). A choice is saved in this browser and the panel
    reloads in it; the AI answers in the same language.
12. **Developer tools** (dev builds only): the test prompt, "Force cloud", "Run prompt".

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
- **While preparing** (High only): the status line "Waiting for the on-device AI…" and then
  "Looking for names on this device…", the elapsed time next to it and a Stop button; the chips,
  the fold and Send are not shown. Standard needs no search: its data shows at once.
- **Preview:** chips "1 name", "2 email addresses", "1 number", "1 link path" (or "No personal
  data found"), the line "Never sent: your address, the raw headers, server IP addresses.", when
  names could not be checked the warning "Some names may still be in the text: read it before
  you send.", then the fold **"Show what will be sent"** (a button with `aria-expanded`, closed
  by default) with the JSON, monospace, scrollable, exactly the text that is sent, no
  highlighting (a highlight built from the text could mark an attacker's own "[name]" as removed).
- Buttons: **"Send to the cloud"** (filled, cloud icon), **"Cancel"** (outlined), full width.
  Below: "Sent once, for this check only, to Gemini through Firebase AI Logic."
- **Sending:** "Checking in the cloud…" with the elapsed time and Stop; Send and Cancel are
  gone; the data stays.
- **Result:** a second band under the card, "Deep check: …" with the cloud's reasons and advice,
  the footer "Checked in the cloud · Done in 1.9 s", and the status "Sent once, for this check
  only." How the cloud and the basic checks were combined goes to a "Deep check" row in Email
  details. The card stays open with the data as the record; "Back to the result" closes it and
  keeps the result, and the button "Deep check in the cloud…" is available again.
- **Failure:** "The deep check did not work (short reason). The result above still applies." The
  card stays open with the data, so the same consent can be sent again.

### The welcome page

A tab of its own (`src/welcome/`), opened once after the first install, not after updates or
reloads (decided 23 Nov 2026). It is where the logo is seen big: in Chrome the icons are 16 to
48 px. Top to bottom, in one centred column of at most 600 px:

1. The logo (160 px, a 320 px PNG of `design/logo.svg`), "Welcome to PhishLocal", one sentence
   on what it does, an info box "Made for Gmail on the web. From other mail apps, paste an email
   into the panel.", and two buttons: "Open the panel" (filled; Chrome opens the side panel only
   within the click, so the page looks up its window on load and hides the button without one)
   and "Open Gmail" (outlined).
2. **How to start** (a card): three numbered steps: pin PhishLocal (Chrome hides new extensions
   under the puzzle piece), open an email in Gmail, read the result.
3. **How your privacy is kept** (a card): the empty state's three points, same text.
4. The flag button with the language menu and "How it works", as in the empty state.

It uses the panel's stylesheet, tokens and components, plus its own `style.css` for the wider
page, and the panel's language (same origin, same saved choice). Its own texts are the
`welcome` section of each dictionary. Like the panel, its DOM holds no `<svg>`, `<a>` or
`<img>`.

## Wording

Tier-1 texts. The same thing has the same name everywhere. These are the English words; the
other languages live in `src/i18n/` and follow the same tiers (no protocol names in tiers 1 and 2) and the same names for the same things.

| Thing                       | Words                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Verdict words               | Checking… / Dangerous / Suspicious / Looks safe / No red flags found                                               |
| Dangerous line              | This looks like phishing.                                                                                          |
| Suspicious line             | Be careful: some signs of phishing.                                                                                |
| Looks safe line             | No signs of phishing found.                                                                                        |
| Not checked by AI           | Not checked by AI. The basic checks alone can miss a well-written scam.                                            |
| AI running line             | AI check starting… / AI check running… 12 s / On-device AI loading… 2:14 / Waiting for the previous email's check… |
| Result footer               | Checked on this device · Done in 1.4 s; Basic checks only (when the AI gave no answer)                             |
| Cloud result footer         | Checked in the cloud · Done in 1.9 s                                                                               |
| Sender status               | Sender confirmed by Gmail / Sender not confirmed / Checking the sender…                                            |
| Hedges                      | Verdict words are nouns; the line under them hedges ("looks like", "some signs"), never                            |
|                             | "this is phishing" and never "this is safe"                                                                        |
| The rule checks             | basic checks (tier 1 and 2); "rule checks" in tier 3 and in the docs                                               |
| The on-device model         | AI, on-device AI; "Gemini Nano" in the empty, loading, download texts and tier 3                                   |
| Deep check button           | Deep check in the cloud…                                                                                           |
| Privacy levels              | Standard / High; "Names of people"                                                                                 |
| Data fold                   | Show what will be sent                                                                                             |
| Cloud send                  | Send to the cloud / Cancel / Stop                                                                                  |
| After sending               | Sent once, for this check only.                                                                                    |
| Paste                       | Paste an email (empty card), Check another email (fold), Use pasted email, Clear                                   |
| Refresh                     | Check the open email again                                                                                         |
| Privacy points (empty card) | Checked on this device / No email is saved / Cloud only if you ask                                                 |
| Not                         | Get a second opinion, Prepare a deep check…, AI loading, Checked 2:14 PM, Nothing is saved                         |

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
| `lookalike-domain`     | A web address imitates a known one                 | Looks like: real domain · Is: domain |
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
Line heights on the 4 px grid: 16 / 18 / 20 / 22 / 24 px. Hierarchy by weight and colour
before size. **Space:** 4 / 8 / 12 / 16 / 24 px. **Radii:** one scale, inner smaller than
outer: cards 12 px, buttons and boxes 8 px, chips 6 px, pills and badges round. **Buttons:**
40 px high (44 px for Send and Cancel), one filled button per screen at most, hierarchy filled →
outlined → plain text, a visible `:focus-visible` ring. **Boxes:** a card only around a thing
that stands on its own (the verdict, a list, the consent); everything else is grouped by
spacing and headings, and rows inside a list are separated by a hairline, not boxed. No coloured
side bars, no gradients, no shadows, no emoji. **Colour:** one accent (blue) for interactive
things only, the three semantic colours only for a real state, grey for everything else.
**Icons:** one set, one stroke width (2 px on a 24 px grid), drawn as SVG files and shown
through CSS `mask-image`, so the panel's DOM holds no `<svg>` and email text can never become
one. **Flags** (`src/sidepanel/flags/`) are colour, so they are CSS backgrounds instead, shown at
3:2 (21 × 14 px) with a 1 px edge: United Kingdom for English, Germany, France, Spain, Italy and
Portugal (our Portuguese is European Portuguese), without coats of arms.

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
| tip            | `#D19A00` | `#F5C542` | advice bulb (decorative)              |
| ready          | `#16A34A` | `#4CC27A` | ready dot (decorative)                |

Every pair is measured before use (text 4.5:1, symbols and meaningful borders 3:1); the
measurements live as comments in `style.css`. The bulb and the ready dot are decorative marks next to the words
that carry their meaning, so in light mode they may be lighter than 3:1 (gold-yellow and bright
green, decided 22 Nov 2026).

## How to build it

- Plain HTML, CSS and TypeScript; no component library, no new dependency.
- **CSS architecture:** cascade layers `tokens, base, layout, components, utilities`, and
  nothing outside a layer. Tokens have semantic names (`--color-danger-text`, `--space-3`),
  never raw hex outside the tokens layer. Width-dependent layout reacts to the panel
  (`container-type: inline-size` on the page root, `@container`), not to the viewport. Logical
  properties (`padding-inline`, `margin-block-start`).
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
- The extension gets icons in `manifest.json`: 16, 32, 48 and 128 px PNGs rendered from the logo,
  `design/logo.svg` (navy rounded square, white house, koi with orange glitter; decided 23 Nov
  2026). It started as an Inkscape trace of the drawing: the background, the house, the mouth's
  border and the top of the head are redrawn, the glitter and the teeth are kept as traced.
  Render the PNGs with Inkscape, for example:
  `inkscape design/logo.svg -w 128 -h 128 -o public/icons/icon-128.png`.
  The SVG itself never ships: it is about 200 KB, and its detail cannot be seen at icon sizes.

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
10. **The panel in six languages** (en, de, fr, es, it, pt), chosen under Settings, "Automatic"
    by default. The language is fixed per page load and a change reloads the panel, so no part
    needs to redraw itself and every text switches at once.

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
- The header pill is green; here grey with a green dot when ready.
- `Main` says "Nothing is saved"; here "No email is saved".
- Missing in the mockup: Suspicious, "No red flags found (not checked by AI)", model unavailable,
  model not downloaded, the paste form, the cloud result.
- `Dangerous` borders every red-flag and link card in its severity colour and uses count pills on
  the headings; here the badge alone carries the severity, rows share one card, and the count is
  plain text. A coloured bar on every row is the mark of generated UIs and emphasises nothing.
- `Main` centres an illustration; here the empty state is left-aligned without one.

## Sources

Researched on 22 Nov 2026 for this spec; the rules above are distilled from them.

- Wording of real warnings: Chrome's interstitials ("Dangerous site", "This site doesn't seem
  right", "Did you mean …?"; `security_interstitials_strings.grdp` in Chromium), Gmail's
  banners ("This message seems dangerous", "Be careful with this message", "Gmail can't confirm
  who sent you the email"; Gmail help 185812 and 13130196), Outlook's "This sender failed our
  fraud detection checks and may not be who they appear to be", Proton's "Official" badge.
  None of them names SPF, DKIM or DMARC in the default view; all pair a hedged headline with one
  plain reason and one safe action.
- Warning research: Akhawe and Felt, "Alice in Warningland" (USENIX 2013); Felt et al.,
  "Improving SSL Warnings" (CHI 2015): opinionated design with one safe choice raises adherence;
  Microsoft's NEAT/SPRUCE checklist (necessary, explained, actionable; source, process, risk,
  unique, choices, evidence); NCSC, "Telling users to avoid clicking bad links still isn't
  working" (no blame, no fear).
- Visual craft: Atlassian (spacing, lozenges, one primary button, empty states), Shopify Polaris
  (one primary button per section), GitHub Primer (type scale, semantic tokens), Material 3 and
  Apple HIG (type, dark mode is not inversion), Lucide's icon guide (24 px grid, 2 px stroke),
  Refactoring UI ("use fewer borders"), and the published lists of "generated UI" tells
  (thefountaininstitute.com, superdesign.dev): boxes around everything, coloured side bars,
  gradients, emoji icons, centred heroes, badges everywhere.
- CSS architecture: Every Layout (stack, composition), CUBE CSS, Max Stoiber ("margin considered
  harmful"), MDN (`@layer`, `:where()`, container queries, logical properties), Josh Comeau
  (`min-width: 0` in flex children).
