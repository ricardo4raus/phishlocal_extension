/*
 * The panel's English text: the master copy. Every other language has exactly these keys, with
 * the same parameters (TypeScript checks it). Tiers 1 and 2 use plain words (docs/ui-design.md):
 * no "rule", no protocol names. Functions take only our own values (counts, names, short
 * reasons); email text never goes through here, it is shown with setText() next to it.
 */
import type { RuleId } from '../rules/types';

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export const en = {
  /** The static text of index.html, by `data-t` key. */
  html: {
    starting: 'Starting…',
    modelLoading: 'On-device AI loading',
    downloadLabel: 'Download of the on-device AI',
    downloadNow: 'Download now',
    emptyHeading: 'Open an email in Gmail',
    emptyText:
      'PhishLocal checks it here, automatically, while this panel is open. The email never leaves your browser.',
    pasteOpen: 'Paste an email',
    privacyTitle: 'How your privacy is kept',
    pointDeviceLead: 'Checked on this device',
    pointDeviceText: 'Basic checks plus Gemini Nano, the AI built into Chrome. Works offline.',
    pointSavedLead: 'No email is saved',
    pointSavedText: 'Close the panel and all reading stops.',
    pointCloudLead: 'Cloud only if you ask',
    pointCloudText: 'Personal data is removed first, and you see what is sent.',
    languages: 'Languages: en · de · fr · es · it · pt',
    howItWorks: 'How it works',
    emailLabel: 'Email',
    senderUnconfirmed: 'Sender not confirmed',
    readAgain: 'Check the open email again',
    resultLabel: 'Result',
    stop: 'Stop',
    redFlags: 'Red flags',
    links: 'Links',
    moreLinks: 'More links',
    deepCheckLabel: 'Deep check in the cloud',
    deepCheckStart: 'Deep check in the cloud…',
    backToResult: 'Back to the result',
    deepCheckTitle: 'Deep check in the cloud',
    deepCheckIntro:
      'A larger model in the cloud checks again. Personal data is removed on this device first.',
    nothingSentYet: 'Nothing has been sent yet.',
    privacyLevel: 'Privacy level',
    levelStandard: 'Standard',
    levelHigh: 'High',
    removes: 'Removes:',
    removesEmails: 'Email addresses',
    removesNumbers: 'Phone, card, account and customer numbers',
    removesIbans: 'IBANs',
    removesLinkPaths: "Link paths (the website's name stays)",
    removesStandard: 'Everything from Standard',
    removesNames: 'Names of people',
    removedOnDevice: 'Removed on this device',
    neverSent: 'Never sent: your address, the raw headers, server IP addresses.',
    namesMayRemain:
      'Some names may still be in the text: read what will be sent before you send it.',
    showData: 'Show what will be sent',
    dataLabel: 'Data that will be sent to the cloud',
    dataExactly:
      "Exactly this text goes to the cloud, with PhishLocal's fixed instructions and nothing else.",
    send: 'Send to the cloud',
    cancel: 'Cancel',
    sentOnce: 'Sent once, for this check only, to Gemini through Firebase AI Logic.',
    emailDetails: 'Email details',
    from: 'From',
    subject: 'Subject',
    senderChecks: 'Sender checks',
    aiAndBasic: 'AI and basic checks',
    deepCheck: 'Deep check',
    notes: 'Notes',
    text: 'Text',
    checkAnother: 'Check another email',
    pasteIntro:
      'Paste an email from any mail app, or its raw source ("Show original"). It stays on this device.',
    fromOptional: 'From (optional)',
    senderPlaceholder: 'Name <address>',
    subjectOptional: 'Subject (optional)',
    emailText: 'Email text',
    usePasted: 'Use pasted email',
    clear: 'Clear',
    sampleLabel: 'Or load a made-up sample',
    chooseSample: 'Choose a sample…',
    load: 'Load',
    settings: 'Settings',
    language: 'Language',
    languageHint:
      "Sets the language of the panel and of the AI's answers. The panel restarts to switch.",
  },

  /** The welcome page's own text (src/welcome/index.html), by `data-t` key; it also uses `html`. */
  welcome: {
    title: 'Welcome to PhishLocal',
    lead: 'PhishLocal checks your emails for phishing with the AI built into Chrome and explains every red flag. Your emails never leave your browser.',
    madeFor: 'Made for Gmail on the web. From other mail apps, paste an email into the panel.',
    openPanel: 'Open the panel',
    openGmail: 'Open Gmail',
    startTitle: 'How to start',
    pinLead: 'Pin PhishLocal',
    pinText:
      "Click the puzzle piece in Chrome's toolbar, then the pin next to PhishLocal. Its icon opens the panel.",
    gmailLead: 'Open an email in Gmail',
    gmailText: 'While the panel is open, PhishLocal checks every email you open, on this device.',
    resultLead: 'Read the result',
    resultText: 'A verdict, every red flag in plain words, and what to do next.',
  },

  /** The language menu. */
  automatic: (name: string) => `Automatic (${name})`,
  /** The languages' names in this language, for sentences ("answers in Italian"). */
  languageNames: {
    en: 'English',
    de: 'German',
    fr: 'French',
    es: 'Spanish',
    it: 'Italian',
    pt: 'Portuguese',
  },

  /** The model pill in the top bar. */
  pill: {
    loading: 'On-device AI loading',
    ready: 'On-device AI ready',
    downloading: 'On-device AI',
    'not-downloaded': 'AI not set up',
    unavailable: 'AI not available',
    failed: 'AI not loaded',
  },

  /** The model banner, only when the model needs the user. */
  banner: {
    'not-downloaded': {
      title: 'Set up on-device AI',
      text: 'Chrome downloads Gemini Nano once, about 4 GB. After that, emails are checked on this device, also offline. Until then they get the basic checks only.',
    },
    downloading: {
      title: 'Setting up on-device AI',
      text: 'Chrome is downloading Gemini Nano. The basic checks already work while you wait, and you can keep using Gmail.',
    },
    unavailable: {
      title: 'On-device AI is not available on this computer',
      text: 'Chrome cannot run Gemini Nano here. Emails get the basic checks only; the deep check in the cloud still works where it is offered.',
    },
    failed: {
      title: 'On-device AI could not load',
      text: 'Chrome could not load Gemini Nano. Emails get the basic checks only; the next check tries again.',
    },
    downloadFailed: (reason: string) => `The download failed (${reason}).`,
  },

  /** The empty state, by why there is no email. */
  empty: {
    idle: {
      heading: 'Open an email in Gmail',
      text: 'PhishLocal checks it here, automatically, while this panel is open. The email never leaves your browser.',
    },
    'not-gmail': {
      heading: 'Open Gmail in this tab',
      text: 'PhishLocal checks the emails you open in Gmail, automatically, while this panel is open. If Gmail was open before PhishLocal was installed or updated, reload the Gmail tab. You can also paste an email from any mail app.',
    },
    unreadable: {
      heading: 'Could not read this email',
      text: 'Gmail may have changed its page. You can paste the email instead.',
    },
  },

  /** The status line under the email: only when it says something the card does not. */
  gmail: {
    headersNote: 'Loading from Gmail…',
    headersMissing: (reason: string) => `Could not load the sender checks: ${reason}.`,
    failures: {
      'no-account-key': "Gmail's page has changed",
      'no-message-id': "Gmail's page has changed",
      'request-failed': 'Gmail did not deliver them',
      timeout: 'Gmail did not answer in time',
      unreadable: "Gmail's page could not be read",
    },
    idle: 'Open an email in Gmail: while this panel is open, PhishLocal checks it automatically, on this device.',
    notGmail:
      'Open Gmail in this tab to check emails automatically. If Gmail was open before PhishLocal was installed or updated, reload the Gmail tab.',
    unreadable: 'Could not read this email. Gmail may have changed its page.',
    textCut: 'The email is long: only the first part was checked.',
  },

  /** The pasted email. */
  paste: {
    rawRead: 'Pasted email with its headers.',
    ready: 'Pasted email.',
    sampleLoaded: (label: string) => `Sample loaded: ${label}. It is made up.`,
    emptyText: 'Paste the email text first.',
    chooseSample: 'Choose a sample first.',
    rawTooLarge: 'The raw email is larger than 5 MB.',
    rawUnreadable: 'The raw email could not be read.',
  },

  /** The email strip and the details. */
  email: {
    noSubject: '(no subject)',
    unknownSender: 'Unknown sender',
    confirmedByGmail: 'Sender confirmed by Gmail',
    confirmedByServer: 'Sender confirmed by your mail server',
    checkingSender: 'Checking the sender…',
    unconfirmed: 'Sender not confirmed',
    fromOwnAddress: 'Sent from your own address',
    headersHint:
      'Not available. For the full check with SPF, DKIM and DMARC: in Gmail, open ⋮ → Show original → Copy to clipboard, then paste it under "Check another email".',
    noAuth: 'None in the headers: the sender cannot be verified.',
    none: 'none',
    checkedBy: (server: string) => `checked by ${server}`,
    invalidAddress: 'Not a valid web address',
    forwardsTo: 'forwards to',
    moreLinks: (count: number) => `${count} more ${count === 1 ? 'link' : 'links'}`,
    linksTitle: (count: number) => `Links (${count})`,
  },

  /** Severity badges. */
  severity: { danger: 'Danger', warning: 'Warning', info: 'Note' },

  /** The red flags. */
  flags: {
    nameSays: 'Name says',
    addressIs: 'Address is',
    looksLike: 'Looks like',
    is: 'Is',
    says: 'Says',
    opens: 'Opens',
    moreLikeThis: (count: number) => `${count} more ${count === 1 ? 'link' : 'links'} like this.`,
    noNotes: 'None.',
    checkFailed: 'The basic checks could not finish. Treat this email with care.',
  },

  /** The plain-word title per rule (tier 1 and 2 never say "rule", "DKIM" or "DMARC"). */
  titles: {
    'dangerous-link': 'A link runs code instead of opening a page',
    'hidden-link-target': 'A link hides where it really goes',
    'ip-link': 'A link goes to a bare number address',
    'international-domain': 'A web address uses letters from another alphabet',
    'link-text-mismatch': "A link doesn't go where its text says",
    'redirect-link': 'A link goes through a forwarding service',
    'lookalike-domain': 'A web address imitates a known one',
    'brand-in-subdomain': 'A known name is used in front of another address',
    'brand-in-domain': "A web address contains a known name but isn't it",
    'sender-name-domain': "The sender's name doesn't match the address",
    'sender-name-brand': 'The sender claims a brand from another address',
    'hidden-characters': 'Words contain invisible characters',
    'mixed-script': 'Words mix letters from different alphabets',
    'direction-override': 'Text is written backwards to disguise an address',
    'reply-to-mismatch': 'Replies would go to a different company',
    'dmarc-fail': "The sender's address is forged",
    'auth-fail': "The sender's mail server didn't confirm this email",
    'dkim-other-domain': 'Signed by another domain',
    'no-auth-results': 'No sender checks in this email',
    'incomplete-check': 'Part of this email could not be checked',
    urgency: 'Time pressure',
    threat: 'Threatens consequences',
    credentials: 'Asks for passwords, identity or card details',
    payment: 'Asks for a payment',
  } satisfies Record<RuleId, string>,

  /**
   * Sentences shown instead of a rule's own message (which is English and may name protocols).
   * English shows the rule's message where none is given here; the other languages give one for
   * every rule, so their panel never shows English sentences.
   */
  sentences: {
    'dmarc-fail':
      "The sender's own mail service says this email did not come from them. That is the surest sign of a forged sender.",
    'auth-fail':
      'The checks that confirm a sender did not pass. Legitimate senders sometimes fail them too, so treat this as a warning, not proof.',
  } as Partial<Record<RuleId, string>>,

  /** The verdict band. */
  verdict: {
    word: {
      pending: 'Checking…',
      safe: 'Looks safe',
      suspicious: 'Suspicious',
      dangerous: 'Dangerous',
      unchecked: 'No red flags found',
    },
    line: {
      safe: 'No signs of phishing found.',
      suspicious: 'Be careful: some signs of phishing.',
      dangerous: 'This looks like phishing.',
      unchecked: 'Not checked by AI. The basic checks alone can miss a well-written scam.',
    },
    advice: {
      safe: 'Stay careful with unexpected requests: if an email asks you to log in or pay, open the site yourself instead of using its links.',
      suspicious:
        "Don't enter passwords or card details and don't pay. Check with the sender through a way you already know.",
      dangerous:
        "Don't click links, open attachments or reply. Delete the email or report it as phishing.",
      unchecked:
        'Stay careful with unexpected requests: if an email asks you to log in or pay, open the site yourself instead of using its links.',
    },
    /** How the AI's own level is named in tier 3 ("The AI said: …"). */
    aiSaid: { safe: 'no signs of phishing', suspicious: 'suspicious', dangerous: 'dangerous' },
    sourceDevice: 'Checked on this device',
    sourceRulesOnly: 'Basic checks only',
    doneIn: (time: string) => `Done in ${time}`,
    /** Our own reasons, shown when the AI's concerns are overruled (its points: Email details). */
    ownReasons: {
      confirmed: 'The sender is confirmed: the email really comes from the domain it shows.',
      nothingAsked: 'No links and no request: there is nothing to fall for.',
      nothingFound: 'The basic checks found no warning signs.',
      sentToSelf: 'Sent from your own address to yourself, not received from outside.',
    },
  },

  /** How the AI's verdict and the rules were combined (tier 3), and the deep check's old line. */
  judge: {
    theAi: 'the AI',
    theCloudAi: 'the cloud AI',
    said: (ai: string, level: string) =>
      `${ai[0]?.toUpperCase() ?? ''}${ai.slice(1)} said: ${level}`,
    lineOnlyNotes: (word: string) =>
      `${word} (sender confirmed, basic checks found nothing; AI notes below)`,
    lineStricter: (word: string, ai: string, level: string) =>
      `${word} (basic checks; ${ai} said: ${level})`,
    detailOnlyNotes: (said: string) =>
      `${said}, but the sender is confirmed and the basic checks found nothing, so its points are notes only.`,
    lineNoLinks: (word: string) => `${word} (no links, basic checks found nothing; AI notes below)`,
    detailNoLinks: (said: string) =>
      `${said}, but the email has no links and the basic checks found nothing, so its points are notes only.`,
    aiPoints: (points: string) => `Its points: ${points}`,
    lineSentToSelf: (word: string) =>
      `${word} (sent from your own address, basic checks found nothing; AI notes below)`,
    detailSentToSelf: (said: string) =>
      `${said}, but the email was sent from your own address and the basic checks found nothing, so its points are notes only.`,
    detailStricter: (said: string) =>
      `${said}; the basic checks found more, so their verdict stands.`,
  },

  /** The on-device AI check while it runs, and why it gave no answer. */
  aiCheck: {
    starting: 'AI check starting…',
    waitingHeaders: 'Waiting for the sender checks…',
    running: (secondTry: boolean) => `AI check running${secondTry ? ' (second try)' : ''}…`,
    loading: (secondTry: boolean) =>
      `On-device AI loading${secondTry ? ' (second try)' : ''}… The first load after Chrome restarts can take a few minutes; the result appears here by itself.`,
    waitingPrevious: "Waiting for the previous email's check…",
    note: 'On-device AI (Gemini Nano). AI can be wrong.',
    experimental: 'Answers in this language are experimental.',
    noModel: 'The on-device AI is not ready, so only the basic checks ran.',
    stopped: 'The AI check was stopped. The basic checks still apply.',
    failed: (secondTry: boolean, detail: string) =>
      `The AI check failed${secondTry ? ' after a second try' : ''} (${detail}). The basic checks still apply.`,
    unreadable: (secondTry: boolean) =>
      `The AI answer could not be read${secondTry ? ' after a second try' : ''}. The basic checks still apply.`,
    unknownError: 'unknown error',
  },

  /** Why a check failed (tier 3). The engine writes these in English; the panel translates. */
  errors: {
    noAnswerWithin: (seconds: string) => `no answer within ${seconds} s`,
    modelWrote: (count: string) => `the model had written ${count} characters`,
    tooLong: (count: string) => `the answer did not end (over ${count} characters)`,
    refused: (status: string) => `the cloud refused the request (HTTP ${status})`,
    cloudFailed: 'the cloud request failed',
    offline: 'no connection to the cloud',
    tokenNoAnswer: (name: string) => `no answer from the token server (${name})`,
    tokenRefused: (status: string) => `the token server refused (HTTP ${status})`,
    signInFailed: (code: string) => `sign-in failed (${code})`,
  },

  /** The deep check in the cloud. */
  deepCheck: {
    notAvailable: 'Not available in this build.',
    waitingHeaders: 'Waiting for the sender checks…',
    recommendedExperimental: (language: string) =>
      `Recommended: on-device answers in ${language} are experimental.`,
    recommendedUnchecked: 'Recommended: the on-device AI did not check this email.',
    chips: {
      names: (count: number) => plural(count, 'name', 'names'),
      emails: (count: number) => plural(count, 'email address', 'email addresses'),
      numbers: (count: number) => plural(count, 'number', 'numbers'),
      ibans: (count: number) => plural(count, 'IBAN', 'IBANs'),
      links: (count: number) => plural(count, 'link path', 'link paths'),
      nothing: 'No personal data found',
      namesKept: 'Names kept',
    },
    changed: {
      idle: '',
      preparing: 'The email changed, so the deep check was stopped. Nothing was sent.',
      preview: 'The email changed, so the prepared data was discarded. Nothing was sent.',
      sending:
        'The email changed while the deep check ran: its data had been sent, its answer was dropped.',
      done: 'The email changed, so the deep check result was cleared.',
    },
    waitingModel: 'Waiting for the on-device AI…',
    lookingForNames: 'Looking for names on this device…',
    prepareFailed: 'The deep check could not prepare its data. Nothing was sent.',
    stopped:
      'The deep check was stopped. The data shown may already have reached the cloud; you can send it again.',
    limit:
      "The deep check has reached today's limit. Nothing was sent; the result above still applies.",
    unreadable:
      'The cloud answer could not be read. The result above still applies; you can send the data again.',
    failed:
      'The deep check did not work. The result above still applies; you can send the data again.',
    failedDetail: (detail: string) => `The cloud request failed: ${detail}.`,
    resultWord: (word: string) => `Deep check: ${word}`,
    source: 'Checked in the cloud',
    note: (time: string) => `Cloud (Gemini via Firebase AI Logic). AI can be wrong. ${time}.`,
    sentOnce: 'Sent once, for this check only.',
    checking: 'Checking in the cloud…',
    showFailed: 'The deep check result could not be shown.',
    levelChanged:
      'The new privacy level applies to the next deep check. The data above was sent at the previous level.',
    nothingSent: 'Nothing was sent.',
    stoppedNothingSent: 'Stopped. Nothing was sent.',
  },
};

/** The shape every language follows: the same keys, strings or functions with the same parameters. */
export type Messages = Widen<typeof en>;

type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : { [K in keyof T]: Widen<T[K]> };
