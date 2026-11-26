# Test results

How well PhishLocal judged a fixed set of test emails, before and after the tuning of
26 Nov 2026. Totals only: the emails are real and stay outside the repo.

## The test set (collected 24 Nov 2026)

53 raw emails, each with the expected verdict written down before PhishLocal saw it.

| Group                       | Count | Source                                                                                                                                                                     |
| --------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phishing                    | 23    | 1 own phishing simulation; 16 from the [Nazario phishing corpus](https://monkey.org/~jose/phishing/) 2025 by Jose Nazario (CC-BY-4.0); 6 made up in Italian and Portuguese |
| Real emails that look scary | 19    | the developer's mailbox: security alerts, verification codes, password resets, parcel notices                                                                              |
| Plain real emails           | 11    | the developer's mailbox (invoices, receipts, newsletters with pressure words); 2 made up in Italian and Portuguese                                                         |

Languages: de 11, en 24, es 4, fr 4, it 4, pt 4, unclear 2.

Counting: a phishing email is found when the verdict is "suspicious" or "dangerous". A real email
is right when the verdict is "safe"; one real email from a shop that sends from a free email
address counts as right with "suspicious" too.

## Results

Each run checked every email in Chrome with the dev-only batch check (`src/dev/batch/`): the same
steps as a pasted email in the panel, Gemini Nano on the device, answers in German.

| Run                           | Phishing found | False alarms (real emails) | No AI answer | AI time (median / max) |
| ----------------------------- | -------------- | -------------------------- | ------------ | ---------------------- |
| 1: before the tuning (25 Nov) | 18 / 23        | 6 / 30                     | 0            | 5.1 s / 9.6 s          |
| 2: after PR #42 (26 Nov)      | 22 / 23        | 2 / 30                     | 2            | 4.5 s / 6.2 s          |

The first model load after a Chrome restart took 498 s and 495 s; then every email started at
once (at most 0.2 s).

## What the runs showed

- **The rules decided the false alarms.** All 6 false alarms of run 1 came from rule warnings,
  which the AI cannot lower. Four were rule errors, fixed in PR #42 (`docs/rules.md`): a broken
  link counted as an international domain, a click tracker's target in the link's path, a
  company's own sites under another ending, and platforms that send for shops.
- **The confirmed-sender exception decided the misses.** Gemini Nano alone called 27 of the 30
  real emails "suspicious" or worse; the exception (DMARC pass, no rule warning) turned 21 of them
  back to safe. But it also hid 5 phishing emails from the attackers' own confirmed domains. It
  now applies only while the links stay with the sender (`docs/ai-check.md`).
- **Still wrong after the tuning:** one phishing email that links only to its own confirmed
  domain; two real emails (a company linking to a short form of its name, and a company's own
  click tracker under another ending, kept as a warning on purpose).
- **No AI answer** twice in run 2: one run reached the 60 s limit, one answer did not end. Both
  emails had an answer in run 1, so this is most likely the model's randomness. The panel then
  shows "Not checked by AI", not a false alarm.
- **Italian and Portuguese:** all 8 right in both runs, although Chrome calls on-device answers
  in these languages experimental.

## Limits

- 53 emails, and the tuning was measured on the same set: the numbers are optimistic for new
  emails.
- Gemini Nano does not answer the same way every time; one run per state.
- Most public phishing is from one inbox (the Nazario corpus) and in English.
