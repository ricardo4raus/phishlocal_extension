# Rule checks

PhishLocal checks every email with plain TypeScript rules before any AI is involved. The rules run
in the side panel, on the device, in milliseconds, without network access. They explain each red
flag in one sentence, and their findings will be passed to the AI prompt as facts to weigh.

The code is in [`src/rules/`](../src/rules/); the entry point is `checkEmail(email)` in
[`src/rules/index.ts`](../src/rules/index.ts).

## How a check runs

1. **Input:** the email from Gmail or from the paste area: sender name and address, subject,
   visible body text (at most 20,000 characters) and links (at most 200, each with its text and
   real target). A raw email ("Show original", "View source") also brings its headers: Reply-To,
   Return-Path and the receiving server's sender checks.
2. **Normalization:** every text is folded the same way before matching: NFKC (full-width and
   ligature letters become plain ones), invisible formatting characters removed, the ideographic
   full stop read as a dot, lowercase, typographic apostrophes as `'`.
3. **Rules:** completeness, headers, sender, lookalike domains, links, pressure phrases and
   Unicode tricks.
4. **Result:** each finding once, the most severe first, at most 30 per email.

A finding has a rule id, a severity, one English sentence and the evidence (the link, domain or
phrases that triggered it, each cut to 200 characters).

| Severity                 | Meaning                                                |
| ------------------------ | ------------------------------------------------------ |
| `danger`                 | A trick that legitimate emails practically never use.  |
| `warning`                | Suspicious, but legitimate emails sometimes do it too. |
| `info` (shown as "Note") | Worth knowing, not suspicious on its own.              |

"The rules found no red flags" never means "safe": the side panel says so, because rules only
catch known tricks.

## The rules

### Links ([`links.ts`](../src/rules/links.ts))

| Rule                   | Severity | Flags                                                    | Example                                                        |
| ---------------------- | -------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| `dangerous-link`       | danger   | Links that run code or open files                        | `javascript:`, `data:`, `file:`, `vbscript:`                   |
| `hidden-link-target`   | danger   | A fake name before an `@` in the address                 | `https://bank.example@evil.example/`                           |
| `ip-link`              | warning  | A bare IP address instead of a domain                    | `http://192.168.10.5/login`                                    |
| `international-domain` | warning  | International letters in the domain (`xn--…`)            | a domain written with a Cyrillic "a"                           |
| `link-text-mismatch`   | warning  | The link text names one domain, the link goes to another | text `lumorabank.example`, target `lumora-bank-verify.example` |
| `redirect-link`        | info     | Like the mismatch, but through a known redirect service  | text `debattr.com`, target `c.gle/…`                           |

- Only link texts that name a domain promise a target: "paypal.com" does, "Click here" does not.
- Domains are compared by their registrable part (`accounts.google.com` belongs to `google.com`),
  using the Public Suffix List from [tldts](https://github.com/remusao/tldts). Shared hosts such
  as `github.io` count as separate sites per user.
- **Forwarding links:** a link that forwards through a parameter, such as
  `https://www.google.com/url?q=https://evil.example/` (an "open redirect"), is checked against
  its final target: the text is compared with it, and the final target gets the IP,
  international-letter and lookalike checks too. Up to 20 parameters per link are read.
- **Redirect services** (`c.gle`, `t.co`, `bit.ly`, `tinyurl.com`, `ow.ly`, `lnkd.in`, Outlook
  safe links, Proofpoint URL Defense; listed in [`services.ts`](../src/rules/services.ts)) hide
  the final target. Real emails use them (Google's own
  emails link "debattr.com" through `c.gle`), so a mismatch behind one is only a note.

### Lookalike domains ([`lookalike.ts`](../src/rules/lookalike.ts))

The sender's domain and every link target (including forwarding targets) are compared with
reference domains: the domains the email itself names (sender, subject, link texts, body) and a
short list of often-imitated real brands in [`brands.ts`](../src/rules/brands.ts).

| Rule                 | Severity                                                   | Flags                                                                                     | Example                                                                  |
| -------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `lookalike-domain`   | danger                                                     | Character tricks (`1`/`l`/`i`, `0`/`o`, `rn`/`m`, `vv`/`w`, `3`/`e`, `5`/`s`) or one typo | `paypa1.com`, `rnicrosoft.com`, `g00gle.com`, `paypall.com`              |
| `brand-in-subdomain` | danger for listed brands, warning for names from the email | A name in front of a different domain                                                     | `paypal.com.secure-login.example`, `dhl.parcel-fee.example`              |
| `brand-in-domain`    | warning                                                    | A domain that contains the name, or a listed brand with another ending                    | `lumora-bank-verify` for `lumorabank`; `paypal.support`, `paypal.com.co` |

- One typo counts only for names of 6 or more letters, otherwise "apply" would imitate "apple".
- Names shorter than 5 letters are not checked for character tricks or for being contained in
  another name ("ups" in `ups-and-downs`). Short listed brands (DHL, UPS, UBS) still count in
  front of another domain (`dhl.parcel-fee.example`) and with another ending (`dhl.xyz`).
- The brands' own domains (also secondary ones such as `googleusercontent.com` or
  `microsoftonline.com`) are never flagged.
- The same name with another ending, taken from the email itself (`shop.de` and `shop.ch`), is
  not flagged: companies often use several country domains.
- Mailing services build click-tracking hosts such as `shop.us14.list-manage.com` (Mailchimp)
  for their customers. For the known ones in [`services.ts`](../src/rules/services.ts)
  (Mailchimp, SendGrid, Mailgun, SparkPost, HubSpot, Salesforce, Mailjet, Klaviyo, Constant
  Contact) the email's own name in front is not flagged; a listed brand's name still is danger,
  because anyone can open an account under any name. For unknown domains, a name from the email
  in front of another domain is a warning.
- One finding per domain: the strongest one.

### Sender ([`sender.ts`](../src/rules/sender.ts))

| Rule                   | Severity | Flags                                                     | Example                               |
| ---------------------- | -------- | --------------------------------------------------------- | ------------------------------------- |
| `sender-name-domain`   | danger   | The sender name shows another company's address or domain | `service@paypal.com <x@evil.example>` |
| `sender-name-domain`   | info     | The same name with another ending                         | `Shop.ch <news@shop.de>`              |
| `sender-name-brand`    | warning  | A listed brand in the name, but not one of its domains    | `PayPal <x@paypal-help.example>`      |
| `international-domain` | warning  | International letters in the sender's domain              | a sender domain with a Cyrillic "a"   |

- Two domains of one listed brand count as the same company (`PayPal.de <service@paypal.com>`).
- Brands also send from domains the list does not know, so a brand name is only a warning.
- Reply-To is not in Gmail's page; it is checked with the headers (next section).

### Headers ([`headers.ts`](../src/rules/headers.ts))

Only for emails read with their raw source: automatically from Gmail's "Show original" page
([`gmail-original-page.ts`](../src/raw/gmail-original-page.ts)), or pasted (parsed by
[`parse-raw-email.ts`](../src/raw/parse-raw-email.ts) with postal-mime). For Gmail, the sender
checks count only if the topmost result comes from Gmail's own server, `mx.google.com`.

| Rule                | Severity                            | Flags                                              | Example                                                            |
| ------------------- | ----------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| `dmarc-fail`        | danger                              | The sender's domain does not confirm the email     | `dmarc=fail header.from=lumorabank.example`                        |
| `auth-fail`         | warning                             | SPF or DKIM failed and neither passed              | `spf=softfail; dkim=none`                                          |
| `reply-to-mismatch` | warning, or info for another ending | Replies go to another company than the sender      | From `lumorabank.example`, Reply-To `lumora.help@freemail.example` |
| `dkim-other-domain` | info                                | Signed only by another domain, and no DMARC result | signed by `mailer.example` for `shop.example`                      |
| `no-auth-results`   | info                                | A raw email without any sender checks              | pasted source from a provider that adds none                       |

- **Only the topmost `Authentication-Results` header counts.** The receiving server adds it last,
  above everything the sender wrote, so a fake `dmarc=pass` further down is ignored, and so is
  `ARC-Authentication-Results`. A raw email from a provider that adds no results of its own can
  still contain a fake one: the messages always name the server that checked.
- One passing check is enough when there is no DMARC result: forwarding breaks SPF but keeps DKIM.
- Return-Path is shown but not checked: mailing services almost always use their own bounce
  domain, so a rule would mostly produce noise.
- Two domains of one listed brand, or of the same registrable domain, count as the same company,
  like in the sender rules.

### Pressure phrases ([`phrases.ts`](../src/rules/phrases.ts))

Phrases in English, German, French and Spanish, matched as whole words with any whitespace in
between, in the subject and the body. One finding per category, with up to five phrases.

| Rule          | Severity | Flags                                         | Examples                                                                                  |
| ------------- | -------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `urgency`     | info     | Time pressure                                 | "within 24 hours", "letzte Mahnung", "dans les 24 heures", "lo antes posible"             |
| `threat`      | info     | Threatened consequences                       | "unusual activity", "Konto wurde gesperrt", "compte suspendu", "acciones legales"         |
| `credentials` | warning  | Requests for identity, log-in or card details | "confirm your identity", "geben Sie Ihre Zugangsdaten", "saisissez votre numéro de carte" |
| `payment`     | warning  | Payment requests                              | "customs fee", "jetzt bezahlen", "payer avec une carte cadeau", "pagar en bitcoin"        |

The lists hold request phrases, not single words: "password", "card number" or "bitcoin" alone
would also flag harmless sentences such as "we will never ask for your card number".

### Unicode tricks ([`unicode.ts`](../src/rules/unicode.ts))

| Rule                 | Severity | Flags                                                       | Example                                |
| -------------------- | -------- | ----------------------------------------------------------- | -------------------------------------- |
| `hidden-characters`  | warning  | Invisible characters inside a Latin, Cyrillic or Greek word | "con<U+200B>firm" (a zero-width space) |
| `mixed-script`       | warning  | Words that mix Latin with Cyrillic or Greek letters         | "paypal" written with a Cyrillic "a"   |
| `direction-override` | warning  | A hidden direction switch (U+202E, U+202D)                  | "moc.lapyap" displayed as "paypal.com" |

- Both tricks hide a word from filters while the reader sees a normal word, so they are red flags
  of their own. The normalization step also removes them, so the other rules still see the word.
- Soft hyphens are not flagged (newsletters use them to hyphenate), nor are joiners in scripts
  that need them (Arabic, Persian, Indic) or in emoji.
- The evidence shows invisible characters as `<U+200B>`.
- Direction overrides (MITRE ATT&CK T1036.002) are also shown visibly in the side panel itself, as
  `<U+202E>`, so the panel never displays reversed text. Other direction marks stay, because
  Arabic and Hebrew text needs them.

### Incomplete check ([`index.ts`](../src/rules/index.ts))

| Rule               | Severity | Flags                                                              |
| ------------------ | -------- | ------------------------------------------------------------------ |
| `incomplete-check` | warning  | Part of the HTML was not read: over 2 MB or over 1,000 levels deep |

Hostile emails pad or nest their HTML to slip past checks, so an email that could not be read
completely is a red flag of its own. Real emails stay far below both limits.

## Security design

- **Pure functions:** no DOM, no network, no storage. All rule tests run in Node.
- **Email content is untrusted:** findings are shown with `textContent` only. Messages contain
  only limited email content (hostnames, our own phrases); raw attacker text such as link texts
  and sender names stays in `evidence`. The AI prompt must pass evidence only as escaped data and
  must not be able to lower a rule's danger finding (OWASP LLM01, prompt injection).
- **No slow regexes (ReDoS):** every regular expression is built from our own fixed lists, escaped,
  without nested repetition that could backtrack. Inputs, domains per text (100), parameters per
  link (20), findings (30) and evidence (200 characters) are capped. The worst case at the input
  limits takes about 180 ms.
- **HTML is read with limits:** parse5 slows down with the square of the nesting depth (40,000
  nested `<div>` take about 5 s), so a tree adapter stops at 1,000 levels and only the first 2 MB
  are read; the tree is walked without recursion. 400,000 levels now take a few milliseconds.
- **Field limits:** sender name 500, address 320, subject 1,000, link text 1,000 and link target
  4,000 characters, enforced in every source and in the message validator.
- **What the reader sees is checked:** for raw emails the body text comes from the HTML part,
  because mail apps show it; a harmless plain-text part cannot hide a phishing HTML part.
- **Fail visibly:** if a rule throws, the side panel says "The rule check failed. Treat this
  email with care." and still shows the email.

## Known limits

- The brand list is short (18 brands); other brands are only protected through the domains the
  email itself names.
- The phrases don't understand negations: "we will never ask you to confirm your password" still
  gets a credentials warning. The AI is meant to weigh such cases.
- International domains are flagged but not decoded (the browser has no punycode decoder). The
  mixed-script rule catches them where the email has the raw letters.
- Words that legitimately mix alphabets (e.g. "μg") get a mixed-script warning.
- Header checks need the raw email. For Gmail it is loaded automatically from the undocumented
  "Show original" page; if Gmail changes that page, the panel says that the sender checks are not
  available. For other mail apps the user pastes the raw source ("View source").

## Adding or changing a rule

1. Put it in the matching file in `src/rules/` (or a new one, called from `checkEmail()`), and add
   its id to `RuleId` in [`types.ts`](../src/rules/types.ts).
2. Write the message from our own words and limited values (hostnames); put raw email text into
   `evidence` with `clip()`.
3. Test both directions: what it must flag, and realistic harmless emails it must not flag.
4. Keep the sample test green: both phishing samples get warnings, the harmless one none
   ([`tests/rules/check-email.test.ts`](../tests/rules/check-email.test.ts)).
5. Add the rule to this file.
