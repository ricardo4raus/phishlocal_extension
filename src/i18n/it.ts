/* Italian. Same keys and parameters as en.ts (the master copy); plain words in tiers 1 and 2. */
import type { Messages } from './en';

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export const it: Messages = {
  html: {
    starting: 'Avvio…',
    modelLoading: 'Caricamento dell’IA locale',
    downloadLabel: 'Download dell’IA locale',
    downloadNow: 'Scarica ora',
    emptyHeading: 'Apri un’email in Gmail',
    emptyText:
      'PhishLocal la controlla qui, in automatico, finché questo pannello è aperto. L’email non lascia mai il tuo browser.',
    pasteOpen: 'Incolla un’email',
    privacyTitle: 'Come viene protetta la tua privacy',
    pointDeviceLead: 'Controllata su questo dispositivo',
    pointDeviceText:
      'Controlli di base più Gemini Nano, l’IA integrata in Chrome. Funziona offline.',
    pointSavedLead: 'Nessuna email viene salvata',
    pointSavedText: 'Chiudi il pannello e ogni lettura si ferma.',
    pointCloudLead: 'Cloud solo se lo chiedi',
    pointCloudText: 'I dati personali vengono rimossi prima, e vedi cosa viene inviato.',
    languages: 'Lingue: en · de · fr · es · it · pt',
    howItWorks: 'Come funziona',
    emailLabel: 'Email',
    senderUnconfirmed: 'Mittente non confermato',
    readAgain: 'Controlla di nuovo l’email aperta',
    resultLabel: 'Risultato',
    stop: 'Ferma',
    redFlags: 'Segnali di allarme',
    links: 'Link',
    moreLinks: 'Altri link',
    deepCheckLabel: 'Controllo approfondito nel cloud',
    deepCheckStart: 'Controllo approfondito nel cloud…',
    backToResult: 'Torna al risultato',
    deepCheckTitle: 'Controllo approfondito nel cloud',
    deepCheckIntro:
      'Un modello più grande nel cloud controlla di nuovo. I dati personali vengono prima rimossi su questo dispositivo.',
    nothingSentYet: 'Non è stato ancora inviato nulla.',
    privacyLevel: 'Livello di privacy',
    levelStandard: 'Standard',
    levelHigh: 'Alto',
    removes: 'Rimuove:',
    removesEmails: 'Indirizzi email',
    removesNumbers: 'Numeri di telefono, carta, conto e cliente',
    removesIbans: 'IBAN',
    removesLinkPaths: 'Percorsi dei link (il nome del sito resta)',
    removesStandard: 'Tutto ciò che rimuove Standard',
    removesNames: 'Nomi di persone',
    removedOnDevice: 'Rimosso su questo dispositivo',
    neverSent:
      'Mai inviati: il tuo indirizzo, le intestazioni grezze, gli indirizzi IP dei server.',
    namesMayRemain:
      'Alcuni nomi potrebbero essere ancora nel testo: leggi cosa verrà inviato prima di inviarlo.',
    showData: 'Mostra cosa verrà inviato',
    dataLabel: 'Dati che verranno inviati al cloud',
    dataExactly:
      'Esattamente questo testo va al cloud, con le istruzioni fisse di PhishLocal e nient’altro.',
    send: 'Invia al cloud',
    cancel: 'Annulla',
    sentOnce: 'Inviato una volta, solo per questo controllo, a Gemini tramite Firebase AI Logic.',
    emailDetails: 'Dettagli dell’email',
    from: 'Da',
    subject: 'Oggetto',
    senderChecks: 'Verifiche del mittente',
    aiAndBasic: 'IA e controlli di base',
    deepCheck: 'Controllo approfondito',
    notes: 'Note',
    text: 'Testo',
    checkAnother: 'Controlla un’altra email',
    pasteIntro:
      'Incolla un’email da qualsiasi app di posta, o il suo sorgente («Mostra originale»). Resta su questo dispositivo.',
    fromOptional: 'Da (facoltativo)',
    senderPlaceholder: 'Nome <indirizzo>',
    subjectOptional: 'Oggetto (facoltativo)',
    emailText: 'Testo dell’email',
    usePasted: 'Controlla l’email incollata',
    clear: 'Cancella',
    sampleLabel: 'Oppure carica un esempio inventato',
    chooseSample: 'Scegli un esempio…',
    load: 'Carica',
    settings: 'Impostazioni',
    language: 'Lingua',
    languageHint:
      'Imposta la lingua del pannello e delle risposte dell’IA. Il pannello si riavvia per cambiarla.',
  },

  welcome: {
    title: 'Ti diamo il benvenuto in PhishLocal',
    lead: 'PhishLocal controlla le tue email contro il phishing con l’IA integrata in Chrome e spiega ogni segnale di allarme. Le tue email non lasciano mai il tuo browser.',
    madeFor: 'Pensato per Gmail sul web. Dalle altre app di posta, incolla l’email nel pannello.',
    openPanel: 'Apri il pannello',
    openGmail: 'Apri Gmail',
    startTitle: 'Come iniziare',
    pinLead: 'Fissa PhishLocal',
    pinText:
      'Fai clic sul pezzo di puzzle nella barra degli strumenti di Chrome, poi sulla puntina accanto a PhishLocal. La sua icona apre il pannello.',
    gmailLead: 'Apri un’email in Gmail',
    gmailText:
      'Finché il pannello è aperto, PhishLocal controlla ogni email che apri, su questo dispositivo.',
    resultLead: 'Leggi il risultato',
    resultText: 'Un verdetto, ogni segnale di allarme in parole semplici e cosa fare dopo.',
  },

  automatic: (name) => `Automatica (${name})`,
  languageNames: {
    en: 'inglese',
    de: 'tedesco',
    fr: 'francese',
    es: 'spagnolo',
    it: 'italiano',
    pt: 'portoghese',
  },

  pill: {
    loading: 'Caricamento dell’IA locale',
    ready: 'IA locale pronta',
    downloading: 'IA locale',
    'not-downloaded': 'IA non installata',
    unavailable: 'IA non disponibile',
    failed: 'IA non caricata',
  },

  banner: {
    'not-downloaded': {
      title: 'Installa l’IA locale',
      text: 'Chrome scarica Gemini Nano una sola volta, circa 4 GB. Dopo, le email vengono controllate su questo dispositivo, anche offline. Fino ad allora ricevono solo i controlli di base.',
    },
    downloading: {
      title: 'Installazione dell’IA locale',
      text: 'Chrome sta scaricando Gemini Nano. I controlli di base funzionano già mentre aspetti, e puoi continuare a usare Gmail.',
    },
    unavailable: {
      title: 'L’IA locale non è disponibile su questo computer',
      text: 'Chrome non può eseguire Gemini Nano qui. Le email ricevono solo i controlli di base; il controllo approfondito nel cloud funziona ancora dove è offerto.',
    },
    failed: {
      title: 'Non è stato possibile caricare l’IA locale',
      text: 'Chrome non è riuscito a caricare Gemini Nano. Le email ricevono solo i controlli di base; il prossimo controllo riprova.',
    },
    downloadFailed: (reason) => `Il download non è riuscito (${reason}).`,
  },

  empty: {
    idle: {
      heading: 'Apri un’email in Gmail',
      text: 'PhishLocal la controlla qui, in automatico, finché questo pannello è aperto. L’email non lascia mai il tuo browser.',
    },
    'not-gmail': {
      heading: 'Apri Gmail in questa scheda',
      text: 'PhishLocal controlla le email che apri in Gmail, in automatico, finché questo pannello è aperto. Se Gmail era aperto prima che PhishLocal fosse installato o aggiornato, ricarica la scheda di Gmail. Puoi anche incollare un’email da qualsiasi app di posta.',
    },
    unreadable: {
      heading: 'Impossibile leggere questa email',
      text: 'Forse Gmail ha cambiato la sua pagina. Puoi incollare l’email al suo posto.',
    },
  },

  gmail: {
    headersNote: 'Caricamento da Gmail…',
    headersMissing: (reason) => `Impossibile caricare le verifiche del mittente: ${reason}.`,
    failures: {
      'no-account-key': 'la pagina di Gmail è cambiata',
      'no-message-id': 'la pagina di Gmail è cambiata',
      'request-failed': 'Gmail non le ha fornite',
      timeout: 'Gmail non ha risposto in tempo',
      unreadable: 'non è stato possibile leggere la pagina di Gmail',
    },
    idle: 'Apri un’email in Gmail: finché questo pannello è aperto, PhishLocal la controlla in automatico, su questo dispositivo.',
    notGmail:
      'Apri Gmail in questa scheda per controllare le email in automatico. Se Gmail era aperto prima che PhishLocal fosse installato o aggiornato, ricarica la scheda di Gmail.',
    unreadable: 'Impossibile leggere questa email. Forse Gmail ha cambiato la sua pagina.',
    textCut: 'L’email è lunga: è stata controllata solo la prima parte.',
  },

  paste: {
    rawRead: 'Email incollata, con le intestazioni.',
    ready: 'Email incollata.',
    sampleLoaded: (label) => `Esempio caricato: ${label}. È inventato.`,
    emptyText: 'Incolla prima il testo dell’email.',
    chooseSample: 'Scegli prima un esempio.',
    rawTooLarge: 'Il sorgente supera i 5 MB.',
    rawUnreadable: 'Non è stato possibile leggere il sorgente.',
  },

  email: {
    noSubject: '(nessun oggetto)',
    unknownSender: 'Mittente sconosciuto',
    confirmedByGmail: 'Mittente confermato da Gmail',
    confirmedByServer: 'Mittente confermato dal tuo server di posta',
    checkingSender: 'Verifica del mittente…',
    unconfirmed: 'Mittente non confermato',
    fromOwnAddress: 'Inviata dal tuo indirizzo',
    headersHint:
      'Non disponibile. Per il controllo completo con SPF, DKIM e DMARC: in Gmail apri ⋮ → Mostra originale → Copia negli appunti, poi incollalo in «Controlla un’altra email».',
    noAuth: 'Nessuna nelle intestazioni: il mittente non può essere confermato.',
    none: 'nessuno',
    checkedBy: (server) => `verificato da ${server}`,
    invalidAddress: 'Indirizzo web non valido',
    forwardsTo: 'reindirizza a',
    moreLinks: (count) => `${count} ${count === 1 ? 'altro link' : 'altri link'}`,
    linksTitle: (count) => `Link (${count})`,
  },

  severity: { danger: 'Pericolo', warning: 'Avviso', info: 'Nota' },

  flags: {
    nameSays: 'Il nome dice',
    addressIs: 'L’indirizzo è',
    looksLike: 'Somiglia a',
    is: 'È',
    says: 'Mostra',
    opens: 'Apre',
    moreLikeThis: (count) => `${count} ${count === 1 ? 'altro link' : 'altri link'} come questo.`,
    noNotes: 'Nessuna.',
    checkFailed: 'I controlli di base non sono riusciti a finire. Tratta questa email con cautela.',
  },

  titles: {
    'dangerous-link': 'Un link esegue codice invece di aprire una pagina',
    'hidden-link-target': 'Un link nasconde dove porta davvero',
    'ip-link': 'Un link porta a un indirizzo fatto solo di numeri',
    'international-domain': 'Un indirizzo web usa lettere di un altro alfabeto',
    'link-text-mismatch': 'Un link non porta dove dice il suo testo',
    'redirect-link': 'Un link passa per un servizio di reindirizzamento',
    'lookalike-domain': 'Un indirizzo web imita uno noto',
    'brand-in-subdomain': 'Un nome noto è messo davanti a un altro indirizzo',
    'brand-in-domain': 'Un indirizzo web contiene un nome noto ma non è il suo',
    'sender-name-domain': 'Il nome del mittente non corrisponde all’indirizzo',
    'sender-name-brand': 'Il mittente si spaccia per un marchio da un altro indirizzo',
    'hidden-characters': 'Alcune parole contengono caratteri invisibili',
    'mixed-script': 'Alcune parole mescolano lettere di alfabeti diversi',
    'direction-override': 'Del testo è scritto al contrario per camuffare un indirizzo',
    'reply-to-mismatch': 'Le risposte andrebbero a un’altra azienda',
    'dmarc-fail': 'L’indirizzo del mittente è falsificato',
    'auth-fail': 'Il server del mittente non ha confermato questa email',
    'dkim-other-domain': 'Firmata da un altro dominio',
    'no-auth-results': 'Nessuna verifica del mittente in questa email',
    'incomplete-check': 'Una parte di questa email non è stata controllata',
    urgency: 'Pressione sul tempo',
    threat: 'Minaccia conseguenze',
    credentials: 'Chiede password, identità o dati della carta',
    payment: 'Chiede un pagamento',
  },

  sentences: {
    'dangerous-link': 'Il link non apre una pagina web: avvia un programma o un file.',
    'hidden-link-target': 'Una «@» nell’indirizzo nasconde dove porta davvero il link.',
    'ip-link': 'Il link porta a un indirizzo fatto solo di numeri invece che a un nome.',
    'international-domain':
      'L’indirizzo usa lettere che somigliano a lettere note e possono imitare un nome familiare.',
    'link-text-mismatch': 'Il testo del link mostra un indirizzo diverso dalla vera destinazione.',
    'redirect-link':
      'Il link passa per un servizio di reindirizzamento; la destinazione finale è ignota.',
    'lookalike-domain': 'L’indirizzo somiglia a uno noto, ma è un altro.',
    'brand-in-subdomain': 'Un nome noto sta davanti, ma l’indirizzo appartiene a qualcun altro.',
    'brand-in-domain': 'L’indirizzo contiene un nome noto, ma non gli appartiene.',
    'sender-name-domain':
      'Il nome mostrato indica un indirizzo diverso da quello da cui arriva l’email.',
    'sender-name-brand': 'Il nome mostrato cita un marchio, ma l’indirizzo non è suo.',
    'hidden-characters':
      'Ci sono caratteri invisibili nelle parole, un trucco per superare i filtri.',
    'mixed-script':
      'Alcune parole mescolano lettere latine con lettere cirilliche o greche dall’aspetto uguale.',
    'direction-override':
      'Un carattere invisibile inverte la direzione del testo, così un indirizzo sembra diverso da com’è.',
    'reply-to-mismatch': 'Una risposta andrebbe a un indirizzo diverso da quello del mittente.',
    'dmarc-fail':
      'Il servizio di posta del mittente dice che questa email non viene da lui. È il segno più sicuro di un mittente falsificato.',
    'auth-fail':
      'Le verifiche che confermano un mittente non sono riuscite. A volte falliscono anche mittenti veri: prendilo come avviso, non come prova.',
    'dkim-other-domain': 'L’email è firmata da un dominio diverso da quello del mittente.',
    'no-auth-results':
      'L’email non contiene verifiche del mittente; non si può confermare chi l’ha inviata.',
    'incomplete-check': 'Una parte dell’email non è stata letta e non è stata controllata.',
    urgency: 'L’email mette fretta.',
    threat: 'L’email minaccia conseguenze.',
    credentials: 'L’email chiede dati di accesso, identità o dati della carta.',
    payment: 'L’email chiede un pagamento.',
  },

  verdict: {
    word: {
      pending: 'Controllo…',
      safe: 'Sembra sicura',
      suspicious: 'Sospetta',
      dangerous: 'Pericolosa',
      unchecked: 'Nessun segnale di allarme trovato',
    },
    line: {
      safe: 'Nessun segno di phishing trovato.',
      suspicious: 'Attenzione: alcuni segni di phishing.',
      dangerous: 'Sembra phishing.',
      unchecked:
        'Non controllata dall’IA. I soli controlli di base possono non accorgersi di una truffa ben fatta.',
    },
    advice: {
      safe: 'Resta attento alle richieste inattese: se un’email ti chiede di accedere o pagare, apri tu il sito invece di usare i suoi link.',
      suspicious:
        'Non inserire password o dati della carta e non pagare. Verifica con il mittente tramite un canale che già conosci.',
      dangerous:
        'Non cliccare link, non aprire allegati e non rispondere. Elimina l’email o segnalala come phishing.',
      unchecked:
        'Resta attento alle richieste inattese: se un’email ti chiede di accedere o pagare, apri tu il sito invece di usare i suoi link.',
    },
    aiSaid: { safe: 'nessun segno di phishing', suspicious: 'sospetta', dangerous: 'pericolosa' },
    sourceDevice: 'Controllata su questo dispositivo',
    sourceRulesOnly: 'Solo controlli di base',
    doneIn: (time) => `Fatto in ${time}`,
    ownReasons: {
      confirmed: 'Il mittente è confermato: l’email arriva davvero dal dominio indicato.',
      nothingAsked: 'Nessun link e nessuna richiesta: non c’è nulla in cui cadere.',
      nothingFound: 'I controlli di base non hanno trovato segnali di allarme.',
      sentToSelf: 'Inviata dal tuo indirizzo a te stesso, non ricevuta dall’esterno.',
    },
  },

  judge: {
    theAi: 'l’IA',
    theCloudAi: 'l’IA nel cloud',
    said: (ai, level) => `${ai[0]?.toUpperCase() ?? ''}${ai.slice(1)} ha risposto: ${level}`,
    lineOnlyNotes: (word) =>
      `${word} (mittente confermato, i controlli di base non hanno trovato nulla; note dell’IA sotto)`,
    lineStricter: (word, ai, level) => `${word} (controlli di base; ${ai} ha risposto: ${level})`,
    detailOnlyNotes: (said) =>
      `${said}, ma il mittente è confermato e i controlli di base non hanno trovato nulla, quindi i suoi punti sono solo note.`,
    lineNoLinks: (word) =>
      `${word} (nessun link, i controlli di base non hanno trovato nulla; note dell’IA sotto)`,
    detailNoLinks: (said) =>
      `${said}, ma l’email non contiene link e i controlli di base non hanno trovato nulla, quindi i suoi punti sono solo note.`,
    aiPoints: (points) => `I suoi punti: ${points}`,
    lineSentToSelf: (word) =>
      `${word} (dal tuo indirizzo, i controlli di base non hanno trovato nulla; note dell’IA sotto)`,
    detailSentToSelf: (said) =>
      `${said}, ma l’email arriva dal tuo indirizzo e i controlli di base non hanno trovato nulla, quindi i suoi punti sono solo note.`,
    detailStricter: (said) =>
      `${said}; i controlli di base hanno trovato di più, quindi vale il loro verdetto.`,
  },

  aiCheck: {
    starting: 'Avvio del controllo dell’IA…',
    waitingHeaders: 'In attesa delle verifiche del mittente…',
    running: (secondTry) => `Controllo dell’IA in corso${secondTry ? ' (secondo tentativo)' : ''}…`,
    loading: (secondTry) =>
      `Caricamento dell’IA locale${secondTry ? ' (secondo tentativo)' : ''}… Il primo caricamento dopo il riavvio di Chrome può richiedere alcuni minuti; il risultato comparirà qui da solo.`,
    waitingPrevious: 'In attesa del controllo dell’email precedente…',
    note: 'IA locale (Gemini Nano). L’IA può sbagliare.',
    experimental: 'Le risposte in questa lingua sono sperimentali.',
    noModel: 'L’IA locale non è pronta, quindi sono stati eseguiti solo i controlli di base.',
    stopped: 'Il controllo dell’IA è stato fermato. I controlli di base restano validi.',
    failed: (secondTry, detail) =>
      `Il controllo dell’IA non è riuscito${secondTry ? ' dopo un secondo tentativo' : ''} (${detail}). I controlli di base restano validi.`,
    unreadable: (secondTry) =>
      `Non è stato possibile leggere la risposta dell’IA${secondTry ? ' dopo un secondo tentativo' : ''}. I controlli di base restano validi.`,
    unknownError: 'errore sconosciuto',
  },

  errors: {
    noAnswerWithin: (seconds) => `nessuna risposta entro ${seconds} s`,
    modelWrote: (count) => `il modello aveva scritto ${count} caratteri`,
    tooLong: (count) => `la risposta non è terminata (oltre ${count} caratteri)`,
    refused: (status) => `il cloud ha rifiutato la richiesta (HTTP ${status})`,
    cloudFailed: 'la richiesta al cloud non è riuscita',
    offline: 'nessuna connessione al cloud',
    tokenNoAnswer: (name) => `nessuna risposta dal server dei token (${name})`,
    tokenRefused: (status) => `il server dei token ha rifiutato (HTTP ${status})`,
    signInFailed: (code) => `accesso non riuscito (${code})`,
  },

  deepCheck: {
    notAvailable: 'Non disponibile in questa versione.',
    waitingHeaders: 'In attesa delle verifiche del mittente…',
    recommendedExperimental: (language) =>
      `Consigliato: le risposte dell’IA locale in ${language} sono sperimentali.`,
    recommendedUnchecked: 'Consigliato: l’IA locale non ha controllato questa email.',
    chips: {
      names: (count) => plural(count, 'nome', 'nomi'),
      emails: (count) => plural(count, 'indirizzo email', 'indirizzi email'),
      numbers: (count) => plural(count, 'numero', 'numeri'),
      ibans: (count) => plural(count, 'IBAN', 'IBAN'),
      links: (count) => plural(count, 'percorso di link', 'percorsi di link'),
      nothing: 'Nessun dato personale trovato',
      namesKept: 'Nomi mantenuti',
    },
    changed: {
      idle: '',
      preparing:
        'L’email è cambiata, quindi il controllo approfondito è stato fermato. Non è stato inviato nulla.',
      preview:
        'L’email è cambiata, quindi i dati preparati sono stati scartati. Non è stato inviato nulla.',
      sending:
        'L’email è cambiata durante il controllo approfondito: i suoi dati erano stati inviati, la risposta è stata scartata.',
      done: 'L’email è cambiata, quindi il risultato del controllo approfondito è stato cancellato.',
    },
    waitingModel: 'In attesa dell’IA locale…',
    lookingForNames: 'Ricerca di nomi su questo dispositivo…',
    prepareFailed:
      'Il controllo approfondito non è riuscito a preparare i dati. Non è stato inviato nulla.',
    stopped:
      'Il controllo approfondito è stato fermato. I dati mostrati potrebbero aver già raggiunto il cloud; puoi inviarli di nuovo.',
    limit:
      'Il controllo approfondito ha raggiunto il limite di oggi. Non è stato inviato nulla; il risultato sopra resta valido.',
    unreadable:
      'Non è stato possibile leggere la risposta del cloud. Il risultato sopra resta valido; puoi inviare di nuovo i dati.',
    failed:
      'Il controllo approfondito non ha funzionato. Il risultato sopra resta valido; puoi inviare di nuovo i dati.',
    failedDetail: (detail) => `La richiesta al cloud non è riuscita: ${detail}.`,
    resultWord: (word) => `Controllo approfondito: ${word}`,
    source: 'Controllata nel cloud',
    note: (time) => `Cloud (Gemini tramite Firebase AI Logic). L’IA può sbagliare. ${time}.`,
    sentOnce: 'Inviato una volta, solo per questo controllo.',
    checking: 'Controllo nel cloud…',
    showFailed: 'Non è stato possibile mostrare il risultato del controllo approfondito.',
    levelChanged:
      'Il nuovo livello di privacy vale per il prossimo controllo approfondito. I dati sopra sono stati inviati con il livello precedente.',
    nothingSent: 'Non è stato inviato nulla.',
    stoppedNothingSent: 'Fermato. Non è stato inviato nulla.',
  },
};
