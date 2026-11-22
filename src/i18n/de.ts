/* German. Same keys and parameters as en.ts (the master copy); plain words in tiers 1 and 2. */
import type { Messages } from './en';

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export const de: Messages = {
  html: {
    starting: 'Wird gestartet…',
    modelLoading: 'Lokale KI wird geladen',
    downloadLabel: 'Download der lokalen KI',
    downloadNow: 'Jetzt herunterladen',
    emptyHeading: 'Öffne eine E-Mail in Gmail',
    emptyText:
      'PhishLocal prüft sie hier, automatisch, solange diese Seitenleiste offen ist. Die E-Mail verlässt deinen Browser nie.',
    pasteOpen: 'E-Mail einfügen',
    privacyTitle: 'So bleiben deine Daten privat',
    pointDeviceLead: 'Auf diesem Gerät geprüft',
    pointDeviceText: 'Grundprüfungen plus Gemini Nano, die KI in Chrome. Funktioniert offline.',
    pointSavedLead: 'Keine E-Mail wird gespeichert',
    pointSavedText: 'Schließe die Seitenleiste, und alles Lesen hört auf.',
    pointCloudLead: 'Cloud nur, wenn du es willst',
    pointCloudText: 'Persönliche Daten werden zuerst entfernt, und du siehst, was gesendet wird.',
    languages: 'Sprachen: en · de · fr · es · it · pt',
    howItWorks: 'So funktioniert es',
    emailLabel: 'E-Mail',
    senderUnconfirmed: 'Absender nicht bestätigt',
    readAgain: 'Offene E-Mail erneut prüfen',
    resultLabel: 'Ergebnis',
    stop: 'Stopp',
    redFlags: 'Warnzeichen',
    links: 'Links',
    moreLinks: 'Weitere Links',
    deepCheckLabel: 'Tiefenprüfung in der Cloud',
    deepCheckStart: 'Tiefenprüfung in der Cloud…',
    backToResult: 'Zurück zum Ergebnis',
    deepCheckTitle: 'Tiefenprüfung in der Cloud',
    deepCheckIntro:
      'Ein größeres Modell in der Cloud prüft noch einmal. Persönliche Daten werden zuerst auf diesem Gerät entfernt.',
    nothingSentYet: 'Noch wurde nichts gesendet.',
    privacyLevel: 'Datenschutzstufe',
    levelStandard: 'Standard',
    levelHigh: 'Hoch',
    removes: 'Entfernt:',
    removesEmails: 'E-Mail-Adressen',
    removesNumbers: 'Telefon-, Karten-, Konto- und Kundennummern',
    removesIbans: 'IBANs',
    removesLinkPaths: 'Link-Pfade (der Name der Website bleibt)',
    removesStandard: 'Alles aus Standard',
    removesNames: 'Namen von Personen',
    removedOnDevice: 'Auf diesem Gerät entfernt',
    neverSent: 'Nie gesendet: deine Adresse, die Roh-Header, IP-Adressen von Servern.',
    namesMayRemain:
      'Einige Namen können noch im Text stehen: Lies, was gesendet wird, bevor du es sendest.',
    showData: 'Zeigen, was gesendet wird',
    dataLabel: 'Daten, die an die Cloud gesendet werden',
    dataExactly:
      'Genau dieser Text geht an die Cloud, mit den festen Anweisungen von PhishLocal und sonst nichts.',
    send: 'An die Cloud senden',
    cancel: 'Abbrechen',
    sentOnce: 'Einmal gesendet, nur für diese Prüfung, an Gemini über Firebase AI Logic.',
    emailDetails: 'E-Mail-Details',
    from: 'Von',
    subject: 'Betreff',
    senderChecks: 'Absenderprüfungen',
    aiAndBasic: 'KI und Grundprüfungen',
    deepCheck: 'Tiefenprüfung',
    notes: 'Hinweise',
    text: 'Text',
    checkAnother: 'Andere E-Mail prüfen',
    pasteIntro:
      'Füge eine E-Mail aus einem beliebigen Mailprogramm ein, oder ihren Quelltext («Original anzeigen»). Sie bleibt auf diesem Gerät.',
    fromOptional: 'Von (optional)',
    senderPlaceholder: 'Name <Adresse>',
    subjectOptional: 'Betreff (optional)',
    emailText: 'Text der E-Mail',
    usePasted: 'Eingefügte E-Mail prüfen',
    clear: 'Leeren',
    sampleLabel: 'Oder ein erfundenes Beispiel laden',
    chooseSample: 'Beispiel wählen…',
    load: 'Laden',
    settings: 'Einstellungen',
    language: 'Sprache',
    languageHint:
      'Legt die Sprache der Seitenleiste und der Antworten der KI fest. Die Seitenleiste startet neu, um zu wechseln.',
  },

  automatic: (name) => `Automatisch (${name})`,
  languageNames: {
    en: 'Englisch',
    de: 'Deutsch',
    fr: 'Französisch',
    es: 'Spanisch',
    it: 'Italienisch',
    pt: 'Portugiesisch',
  },

  pill: {
    loading: 'Lokale KI wird geladen',
    ready: 'Lokale KI bereit',
    downloading: 'Lokale KI',
    'not-downloaded': 'KI nicht eingerichtet',
    unavailable: 'KI nicht verfügbar',
    failed: 'KI nicht geladen',
  },

  banner: {
    'not-downloaded': {
      title: 'Lokale KI einrichten',
      text: 'Chrome lädt Gemini Nano einmal herunter, etwa 4 GB. Danach werden E-Mails auf diesem Gerät geprüft, auch offline. Bis dahin erhalten sie nur die Grundprüfungen.',
    },
    downloading: {
      title: 'Lokale KI wird eingerichtet',
      text: 'Chrome lädt Gemini Nano herunter. Die Grundprüfungen funktionieren schon, während du wartest, und du kannst Gmail weiter nutzen.',
    },
    unavailable: {
      title: 'Lokale KI ist auf diesem Computer nicht verfügbar',
      text: 'Chrome kann Gemini Nano hier nicht ausführen. E-Mails erhalten nur die Grundprüfungen; die Tiefenprüfung in der Cloud funktioniert weiterhin, wo sie angeboten wird.',
    },
    failed: {
      title: 'Lokale KI konnte nicht geladen werden',
      text: 'Chrome konnte Gemini Nano nicht laden. E-Mails erhalten nur die Grundprüfungen; die nächste Prüfung versucht es erneut.',
    },
    downloadFailed: (reason) => `Der Download ist fehlgeschlagen (${reason}).`,
  },

  empty: {
    idle: {
      heading: 'Öffne eine E-Mail in Gmail',
      text: 'PhishLocal prüft sie hier, automatisch, solange diese Seitenleiste offen ist. Die E-Mail verlässt deinen Browser nie.',
    },
    'not-gmail': {
      heading: 'Öffne Gmail in diesem Tab',
      text: 'PhishLocal prüft die E-Mails, die du in Gmail öffnest, automatisch, solange diese Seitenleiste offen ist. War Gmail schon offen, bevor PhishLocal installiert oder aktualisiert wurde, lade den Gmail-Tab neu. Du kannst auch eine E-Mail aus einem beliebigen Mailprogramm einfügen.',
    },
    unreadable: {
      heading: 'Diese E-Mail konnte nicht gelesen werden',
      text: 'Gmail hat vielleicht seine Seite geändert. Du kannst die E-Mail stattdessen einfügen.',
    },
  },

  gmail: {
    checked: 'Automatisch auf diesem Gerät geprüft.',
    headersRead: 'Absenderprüfungen aus Gmail gelesen.',
    headersLoading: 'Absenderprüfungen werden geladen…',
    headersNote: 'Wird aus Gmail geladen…',
    headersMissing: (reason) => `Absenderprüfungen nicht verfügbar: ${reason}.`,
    failures: {
      'no-account-key': 'Gmails Seite hat sich geändert',
      'no-message-id': 'Gmails Seite hat sich geändert',
      'request-failed': 'Gmail hat sie nicht geliefert',
      timeout: 'Gmail hat nicht rechtzeitig geantwortet',
      unreadable: 'Gmails Seite konnte nicht gelesen werden',
    },
    idle: 'Öffne eine E-Mail in Gmail: Solange diese Seitenleiste offen ist, prüft PhishLocal sie automatisch, auf diesem Gerät.',
    notGmail:
      'Öffne Gmail in diesem Tab, um E-Mails automatisch zu prüfen. War Gmail schon offen, bevor PhishLocal installiert oder aktualisiert wurde, lade den Gmail-Tab neu.',
    unreadable:
      'Diese E-Mail konnte nicht gelesen werden. Gmail hat vielleicht seine Seite geändert.',
    textCut: 'Der Text ist lang und wurde gekürzt.',
  },

  paste: {
    rawRead: 'Quelltext gelesen, mit Headern. Nichts hat deinen Browser verlassen.',
    ready: 'Eingefügte E-Mail bereit. Nichts hat deinen Browser verlassen.',
    sampleLoaded: (label) => `Beispiel geladen: ${label}. Es ist erfunden.`,
    emptyText: 'Füge zuerst den Text der E-Mail ein.',
    chooseSample: 'Wähle zuerst ein Beispiel.',
    rawTooLarge: 'Der Quelltext ist größer als 5 MB.',
    rawUnreadable: 'Der Quelltext konnte nicht gelesen werden.',
  },

  email: {
    noSubject: '(kein Betreff)',
    unknownSender: 'Unbekannter Absender',
    confirmedByGmail: 'Absender von Gmail bestätigt',
    confirmedByServer: 'Absender von deinem Mailserver bestätigt',
    checkingSender: 'Absender wird geprüft…',
    unconfirmed: 'Absender nicht bestätigt',
    headersHint:
      'Nicht verfügbar. Für die volle Prüfung mit SPF, DKIM und DMARC: in Gmail ⋮ → Original anzeigen → In die Zwischenablage kopieren, dann unter «Andere E-Mail prüfen» einfügen.',
    noAuth: 'Keine in den Headern: Der Absender kann nicht bestätigt werden.',
    none: 'keine',
    checkedBy: (server) => `geprüft von ${server}`,
    invalidAddress: 'Keine gültige Webadresse',
    forwardsTo: 'leitet weiter zu',
    moreLinks: (count) => `${count} ${count === 1 ? 'weiterer Link' : 'weitere Links'}`,
    linksTitle: (count) => `Links (${count})`,
  },

  severity: { danger: 'Gefahr', warning: 'Warnung', info: 'Hinweis' },

  flags: {
    nameSays: 'Name sagt',
    addressIs: 'Adresse ist',
    looksLike: 'Sieht aus wie',
    is: 'Ist',
    says: 'Zeigt',
    opens: 'Öffnet',
    moreLikeThis: (count) =>
      `${count} ${count === 1 ? 'weiterer Link' : 'weitere Links'} dieser Art.`,
    noNotes: 'Keine.',
    checkFailed:
      'Die Grundprüfungen konnten nicht fertig werden. Sei bei dieser E-Mail vorsichtig.',
  },

  titles: {
    'dangerous-link': 'Ein Link führt Code aus, statt eine Seite zu öffnen',
    'hidden-link-target': 'Ein Link verbirgt, wohin er wirklich führt',
    'ip-link': 'Ein Link führt zu einer reinen Zahlenadresse',
    'international-domain': 'Eine Webadresse nutzt Buchstaben aus einem anderen Alphabet',
    'link-text-mismatch': 'Ein Link führt nicht dorthin, wo sein Text sagt',
    'redirect-link': 'Ein Link läuft über einen Weiterleitungsdienst',
    'lookalike-domain': 'Eine Webadresse ahmt eine bekannte nach',
    'brand-in-subdomain': 'Ein bekannter Name steht vor einer anderen Adresse',
    'brand-in-domain': 'Eine Webadresse enthält einen bekannten Namen, ist es aber nicht',
    'sender-name-domain': 'Der Name des Absenders passt nicht zur Adresse',
    'sender-name-brand': 'Der Absender gibt sich als Marke aus, mit einer anderen Adresse',
    'hidden-characters': 'Wörter enthalten unsichtbare Zeichen',
    'mixed-script': 'Wörter mischen Buchstaben aus verschiedenen Alphabeten',
    'direction-override': 'Text ist rückwärts geschrieben, um eine Adresse zu tarnen',
    'reply-to-mismatch': 'Antworten gingen an eine andere Firma',
    'dmarc-fail': 'Die Adresse des Absenders ist gefälscht',
    'auth-fail': 'Der Mailserver des Absenders hat diese E-Mail nicht bestätigt',
    'dkim-other-domain': 'Von einer anderen Domain signiert',
    'no-auth-results': 'Keine Absenderprüfungen in dieser E-Mail',
    'incomplete-check': 'Ein Teil dieser E-Mail konnte nicht geprüft werden',
    urgency: 'Zeitdruck',
    threat: 'Droht mit Folgen',
    credentials: 'Fragt nach Passwörtern, Identität oder Kartendaten',
    payment: 'Fragt nach einer Zahlung',
  },

  sentences: {
    'dangerous-link':
      'Der Link öffnet keine Webseite, sondern startet ein Programm oder eine Datei.',
    'hidden-link-target': 'Ein «@» in der Adresse verdeckt, wohin der Link wirklich führt.',
    'ip-link': 'Der Link führt zu einer reinen Zahlenadresse statt zu einem Namen.',
    'international-domain':
      'Die Adresse nutzt Buchstaben, die bekannten Buchstaben gleichen und so einen bekannten Namen nachahmen können.',
    'link-text-mismatch': 'Der Text des Links zeigt eine andere Adresse als das wirkliche Ziel.',
    'redirect-link':
      'Der Link läuft über einen Weiterleitungsdienst; das endgültige Ziel ist offen.',
    'lookalike-domain': 'Die Adresse sieht einer bekannten Adresse ähnlich, ist aber eine andere.',
    'brand-in-subdomain': 'Ein bekannter Name steht vorne, aber die Adresse gehört jemand anderem.',
    'brand-in-domain': 'Die Adresse enthält einen bekannten Namen, gehört aber nicht dazu.',
    'sender-name-domain':
      'Der angezeigte Name nennt eine andere Adresse als die, von der die E-Mail kommt.',
    'sender-name-brand':
      'Der angezeigte Name nennt eine Marke, aber die Adresse gehört nicht zu ihr.',
    'hidden-characters':
      'Unsichtbare Zeichen stehen in Wörtern, ein Trick, um an Filtern vorbeizukommen.',
    'mixed-script':
      'Wörter mischen lateinische Buchstaben mit gleich aussehenden kyrillischen oder griechischen.',
    'direction-override':
      'Ein unsichtbares Zeichen dreht die Schreibrichtung um, sodass eine Adresse anders aussieht, als sie ist.',
    'reply-to-mismatch': 'Eine Antwort ginge an eine andere Adresse als die des Absenders.',
    'dmarc-fail':
      'Der Mailanbieter des Absenders sagt, dass diese E-Mail nicht von ihm kommt. Das ist das sicherste Zeichen für einen gefälschten Absender.',
    'auth-fail':
      'Die Prüfungen, die einen Absender bestätigen, sind nicht bestanden. Auch echte Absender fallen manchmal durch; nimm es als Warnung, nicht als Beweis.',
    'dkim-other-domain': 'Die E-Mail ist von einer anderen Domain signiert als der des Absenders.',
    'no-auth-results':
      'Die E-Mail enthält keine Absenderprüfungen; der Absender kann nicht bestätigt werden.',
    'incomplete-check': 'Ein Teil der E-Mail konnte nicht gelesen werden und wurde nicht geprüft.',
    urgency: 'Die E-Mail macht Zeitdruck.',
    threat: 'Die E-Mail droht mit Folgen.',
    credentials: 'Die E-Mail fragt nach Anmeldedaten, Identität oder Kartendaten.',
    payment: 'Die E-Mail fragt nach einer Zahlung.',
  },

  verdict: {
    word: {
      pending: 'Wird geprüft…',
      safe: 'Sieht sicher aus',
      suspicious: 'Verdächtig',
      dangerous: 'Gefährlich',
      unchecked: 'Keine Warnzeichen gefunden',
    },
    line: {
      safe: 'Keine Anzeichen von Phishing gefunden.',
      suspicious: 'Vorsicht: einige Anzeichen von Phishing.',
      dangerous: 'Das sieht nach Phishing aus.',
      unchecked:
        'Nicht von der KI geprüft. Die Grundprüfungen allein können einen gut gemachten Betrug übersehen.',
    },
    advice: {
      safe: 'Bleib bei unerwarteten Anfragen vorsichtig: Fragt eine E-Mail nach einer Anmeldung oder Zahlung, öffne die Website selbst statt über ihre Links.',
      suspicious:
        'Gib keine Passwörter oder Kartendaten ein und zahle nicht. Frag beim Absender auf einem Weg nach, den du schon kennst.',
      dangerous:
        'Klicke keine Links an, öffne keine Anhänge und antworte nicht. Lösche die E-Mail oder melde sie als Phishing.',
      unchecked:
        'Bleib bei unerwarteten Anfragen vorsichtig: Fragt eine E-Mail nach einer Anmeldung oder Zahlung, öffne die Website selbst statt über ihre Links.',
    },
    aiSaid: {
      safe: 'keine Anzeichen von Phishing',
      suspicious: 'verdächtig',
      dangerous: 'gefährlich',
    },
    sourceDevice: 'Auf diesem Gerät geprüft',
    sourceRulesOnly: 'Nur Grundprüfungen',
    doneIn: (time) => `Fertig in ${time}`,
  },

  judge: {
    theAi: 'die KI',
    theCloudAi: 'die Cloud-KI',
    said: (ai, level) => `${ai[0]?.toUpperCase() ?? ''}${ai.slice(1)} sagte: ${level}`,
    lineOnlyNotes: (word) =>
      `${word} (Absender bestätigt, Grundprüfungen fanden nichts; Hinweise der KI unten)`,
    lineStricter: (word, ai, level) => `${word} (Grundprüfungen; ${ai} sagte: ${level})`,
    detailOnlyNotes: (said) =>
      `${said}, aber der Absender ist bestätigt und die Grundprüfungen fanden nichts, also sind ihre Punkte nur Hinweise.`,
    detailStricter: (said) => `${said}; die Grundprüfungen fanden mehr, also gilt ihr Ergebnis.`,
  },

  aiCheck: {
    starting: 'KI-Prüfung startet…',
    waitingHeaders: 'Warte auf die Absenderprüfungen…',
    running: (secondTry) => `KI-Prüfung läuft${secondTry ? ' (zweiter Versuch)' : ''}…`,
    loading: (secondTry) =>
      `Lokale KI wird geladen${secondTry ? ' (zweiter Versuch)' : ''}… Das erste Laden nach einem Neustart von Chrome kann einige Minuten dauern; das Ergebnis erscheint hier von selbst.`,
    waitingPrevious: 'Warte auf die Prüfung der vorherigen E-Mail…',
    note: 'Lokale KI (Gemini Nano). KI kann sich irren.',
    experimental: 'Antworten in dieser Sprache sind experimentell.',
    noModel: 'Die lokale KI ist nicht bereit, also liefen nur die Grundprüfungen.',
    stopped: 'Die KI-Prüfung wurde gestoppt. Die Grundprüfungen gelten weiterhin.',
    failed: (secondTry, detail) =>
      `Die KI-Prüfung ist fehlgeschlagen${secondTry ? ' (auch im zweiten Versuch)' : ''} (${detail}). Die Grundprüfungen gelten weiterhin.`,
    unreadable: (secondTry) =>
      `Die Antwort der KI konnte nicht gelesen werden${secondTry ? ' (auch im zweiten Versuch)' : ''}. Die Grundprüfungen gelten weiterhin.`,
    unknownError: 'unbekannter Fehler',
  },

  errors: {
    noAnswerWithin: (seconds) => `keine Antwort innerhalb von ${seconds} s`,
    modelWrote: (count) => `das Modell hatte ${count} Zeichen geschrieben`,
    tooLong: (count) => `die Antwort endete nicht (über ${count} Zeichen)`,
    refused: (status) => `die Cloud hat die Anfrage abgelehnt (HTTP ${status})`,
    cloudFailed: 'die Anfrage an die Cloud ist fehlgeschlagen',
    offline: 'keine Verbindung zur Cloud',
    tokenNoAnswer: (name) => `keine Antwort vom Token-Server (${name})`,
    tokenRefused: (status) => `der Token-Server hat abgelehnt (HTTP ${status})`,
    signInFailed: (code) => `Anmeldung fehlgeschlagen (${code})`,
  },

  deepCheck: {
    notAvailable: 'In dieser Version nicht verfügbar.',
    waitingHeaders: 'Warte auf die Absenderprüfungen…',
    recommendedExperimental: (language) =>
      `Empfohlen: Antworten der lokalen KI auf ${language} sind experimentell.`,
    recommendedUnchecked: 'Empfohlen: Die lokale KI hat diese E-Mail nicht geprüft.',
    chips: {
      names: (count) => plural(count, 'Name', 'Namen'),
      emails: (count) => plural(count, 'E-Mail-Adresse', 'E-Mail-Adressen'),
      numbers: (count) => plural(count, 'Nummer', 'Nummern'),
      ibans: (count) => plural(count, 'IBAN', 'IBANs'),
      links: (count) => plural(count, 'Link-Pfad', 'Link-Pfade'),
      nothing: 'Keine persönlichen Daten gefunden',
      namesKept: 'Namen behalten',
    },
    changed: {
      idle: '',
      preparing:
        'Die E-Mail hat sich geändert, also wurde die Tiefenprüfung gestoppt. Nichts wurde gesendet.',
      preview:
        'Die E-Mail hat sich geändert, also wurden die vorbereiteten Daten verworfen. Nichts wurde gesendet.',
      sending:
        'Die E-Mail hat sich während der Tiefenprüfung geändert: ihre Daten waren gesendet, die Antwort wurde verworfen.',
      done: 'Die E-Mail hat sich geändert, also wurde das Ergebnis der Tiefenprüfung entfernt.',
    },
    waitingModel: 'Warte auf die lokale KI…',
    lookingForNames: 'Suche Namen auf diesem Gerät…',
    prepareFailed: 'Die Tiefenprüfung konnte ihre Daten nicht vorbereiten. Nichts wurde gesendet.',
    stopped:
      'Die Tiefenprüfung wurde gestoppt. Die gezeigten Daten haben die Cloud vielleicht schon erreicht; du kannst sie erneut senden.',
    limit:
      'Die Tiefenprüfung hat ihr Tageslimit erreicht. Nichts wurde gesendet; das Ergebnis oben gilt weiterhin.',
    unreadable:
      'Die Antwort der Cloud konnte nicht gelesen werden. Das Ergebnis oben gilt weiterhin; du kannst die Daten erneut senden.',
    failed:
      'Die Tiefenprüfung hat nicht funktioniert. Das Ergebnis oben gilt weiterhin; du kannst die Daten erneut senden.',
    failedDetail: (detail) => `Die Anfrage an die Cloud ist fehlgeschlagen: ${detail}.`,
    resultWord: (word) => `Tiefenprüfung: ${word}`,
    source: 'In der Cloud geprüft',
    note: (time) => `Cloud (Gemini über Firebase AI Logic). KI kann sich irren. ${time}.`,
    sentOnce: 'Einmal gesendet, nur für diese Prüfung.',
    checking: 'Wird in der Cloud geprüft…',
    showFailed: 'Das Ergebnis der Tiefenprüfung konnte nicht angezeigt werden.',
    levelChanged:
      'Die neue Datenschutzstufe gilt für die nächste Tiefenprüfung. Die Daten oben wurden mit der vorherigen Stufe gesendet.',
    nothingSent: 'Nichts wurde gesendet.',
    stoppedNothingSent: 'Gestoppt. Nichts wurde gesendet.',
  },
};
