/* French. Same keys and parameters as en.ts (the master copy); plain words in tiers 1 and 2. */
import type { Messages } from './en';

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export const fr: Messages = {
  html: {
    starting: 'Démarrage…',
    modelLoading: 'Chargement de l’IA locale',
    downloadLabel: 'Téléchargement de l’IA locale',
    downloadNow: 'Télécharger maintenant',
    emptyHeading: 'Ouvrez un e-mail dans Gmail',
    emptyText:
      'PhishLocal le vérifie ici, automatiquement, tant que ce panneau est ouvert. L’e-mail ne quitte jamais votre navigateur.',
    pasteOpen: 'Coller un e-mail',
    privacyTitle: 'Comment votre vie privée est protégée',
    pointDeviceLead: 'Vérifié sur cet appareil',
    pointDeviceText:
      'Vérifications de base plus Gemini Nano, l’IA intégrée à Chrome. Fonctionne hors ligne.',
    pointSavedLead: 'Aucun e-mail n’est enregistré',
    pointSavedText: 'Fermez le panneau et toute lecture s’arrête.',
    pointCloudLead: 'Le cloud seulement si vous le demandez',
    pointCloudText:
      'Les données personnelles sont d’abord retirées, et vous voyez ce qui est envoyé.',
    languages: 'Langues : en · de · fr · es · it · pt',
    howItWorks: 'Comment ça marche',
    emailLabel: 'E-mail',
    senderUnconfirmed: 'Expéditeur non confirmé',
    readAgain: 'Vérifier à nouveau l’e-mail ouvert',
    resultLabel: 'Résultat',
    stop: 'Arrêter',
    redFlags: 'Signaux d’alerte',
    links: 'Liens',
    moreLinks: 'Autres liens',
    deepCheckLabel: 'Analyse approfondie dans le cloud',
    deepCheckStart: 'Analyse approfondie dans le cloud…',
    backToResult: 'Retour au résultat',
    deepCheckTitle: 'Analyse approfondie dans le cloud',
    deepCheckIntro:
      'Un modèle plus grand dans le cloud vérifie à nouveau. Les données personnelles sont d’abord retirées sur cet appareil.',
    nothingSentYet: 'Rien n’a encore été envoyé.',
    privacyLevel: 'Niveau de confidentialité',
    levelStandard: 'Standard',
    levelHigh: 'Élevé',
    removes: 'Retire :',
    removesEmails: 'Adresses e-mail',
    removesNumbers: 'Numéros de téléphone, de carte, de compte et de client',
    removesIbans: 'IBAN',
    removesLinkPaths: 'Chemins des liens (le nom du site reste)',
    removesStandard: 'Tout ce que retire Standard',
    removesNames: 'Noms de personnes',
    removedOnDevice: 'Retiré sur cet appareil',
    neverSent: 'Jamais envoyé : votre adresse, les en-têtes bruts, les adresses IP des serveurs.',
    namesMayRemain:
      'Certains noms peuvent encore figurer dans le texte : lisez ce qui sera envoyé avant de l’envoyer.',
    showData: 'Voir ce qui sera envoyé',
    dataLabel: 'Données qui seront envoyées au cloud',
    dataExactly:
      'Exactement ce texte part vers le cloud, avec les instructions fixes de PhishLocal et rien d’autre.',
    send: 'Envoyer au cloud',
    cancel: 'Annuler',
    sentOnce: 'Envoyé une fois, pour cette analyse seulement, à Gemini via Firebase AI Logic.',
    emailDetails: 'Détails de l’e-mail',
    from: 'De',
    subject: 'Objet',
    senderChecks: 'Vérifications de l’expéditeur',
    aiAndBasic: 'IA et vérifications de base',
    deepCheck: 'Analyse approfondie',
    notes: 'Remarques',
    text: 'Texte',
    checkAnother: 'Vérifier un autre e-mail',
    pasteIntro:
      'Collez un e-mail de n’importe quelle messagerie, ou sa source brute (« Afficher l’original »). Il reste sur cet appareil.',
    fromOptional: 'De (facultatif)',
    senderPlaceholder: 'Nom <adresse>',
    subjectOptional: 'Objet (facultatif)',
    emailText: 'Texte de l’e-mail',
    usePasted: 'Vérifier l’e-mail collé',
    clear: 'Effacer',
    sampleLabel: 'Ou charger un exemple inventé',
    chooseSample: 'Choisir un exemple…',
    load: 'Charger',
    settings: 'Paramètres',
    language: 'Langue',
    languageHint:
      'Définit la langue du panneau et des réponses de l’IA. Le panneau redémarre pour changer.',
  },

  automatic: (name) => `Automatique (${name})`,
  languageNames: {
    en: 'anglais',
    de: 'allemand',
    fr: 'français',
    es: 'espagnol',
    it: 'italien',
    pt: 'portugais',
  },

  pill: {
    loading: 'Chargement de l’IA locale',
    ready: 'IA locale prête',
    downloading: 'IA locale',
    'not-downloaded': 'IA non installée',
    unavailable: 'IA non disponible',
    failed: 'IA non chargée',
  },

  banner: {
    'not-downloaded': {
      title: 'Installer l’IA locale',
      text: 'Chrome télécharge Gemini Nano une seule fois, environ 4 Go. Ensuite, les e-mails sont vérifiés sur cet appareil, même hors ligne. D’ici là, ils ne reçoivent que les vérifications de base.',
    },
    downloading: {
      title: 'Installation de l’IA locale',
      text: 'Chrome télécharge Gemini Nano. Les vérifications de base fonctionnent déjà pendant l’attente, et vous pouvez continuer à utiliser Gmail.',
    },
    unavailable: {
      title: 'L’IA locale n’est pas disponible sur cet ordinateur',
      text: 'Chrome ne peut pas exécuter Gemini Nano ici. Les e-mails ne reçoivent que les vérifications de base ; l’analyse approfondie dans le cloud fonctionne toujours là où elle est proposée.',
    },
    failed: {
      title: 'L’IA locale n’a pas pu se charger',
      text: 'Chrome n’a pas pu charger Gemini Nano. Les e-mails ne reçoivent que les vérifications de base ; la prochaine vérification réessaie.',
    },
    downloadFailed: (reason) => `Le téléchargement a échoué (${reason}).`,
  },

  empty: {
    idle: {
      heading: 'Ouvrez un e-mail dans Gmail',
      text: 'PhishLocal le vérifie ici, automatiquement, tant que ce panneau est ouvert. L’e-mail ne quitte jamais votre navigateur.',
    },
    'not-gmail': {
      heading: 'Ouvrez Gmail dans cet onglet',
      text: 'PhishLocal vérifie les e-mails que vous ouvrez dans Gmail, automatiquement, tant que ce panneau est ouvert. Si Gmail était ouvert avant l’installation ou la mise à jour de PhishLocal, rechargez l’onglet Gmail. Vous pouvez aussi coller un e-mail de n’importe quelle messagerie.',
    },
    unreadable: {
      heading: 'Impossible de lire cet e-mail',
      text: 'Gmail a peut-être modifié sa page. Vous pouvez coller l’e-mail à la place.',
    },
  },

  gmail: {
    headersNote: 'Chargement depuis Gmail…',
    headersMissing: (reason) =>
      `Impossible de charger les vérifications de l’expéditeur : ${reason}.`,
    failures: {
      'no-account-key': 'la page de Gmail a changé',
      'no-message-id': 'la page de Gmail a changé',
      'request-failed': 'Gmail ne les a pas fournies',
      timeout: 'Gmail n’a pas répondu à temps',
      unreadable: 'la page de Gmail n’a pas pu être lue',
    },
    idle: 'Ouvrez un e-mail dans Gmail : tant que ce panneau est ouvert, PhishLocal le vérifie automatiquement, sur cet appareil.',
    notGmail:
      'Ouvrez Gmail dans cet onglet pour vérifier les e-mails automatiquement. Si Gmail était ouvert avant l’installation ou la mise à jour de PhishLocal, rechargez l’onglet Gmail.',
    unreadable: 'Impossible de lire cet e-mail. Gmail a peut-être modifié sa page.',
    textCut: 'L’e-mail est long : seule la première partie a été vérifiée.',
  },

  paste: {
    rawRead: 'E-mail collé, avec ses en-têtes.',
    ready: 'E-mail collé.',
    sampleLoaded: (label) => `Exemple chargé : ${label}. Il est inventé.`,
    emptyText: 'Collez d’abord le texte de l’e-mail.',
    chooseSample: 'Choisissez d’abord un exemple.',
    rawTooLarge: 'La source brute dépasse 5 Mo.',
    rawUnreadable: 'La source brute n’a pas pu être lue.',
  },

  email: {
    noSubject: '(sans objet)',
    unknownSender: 'Expéditeur inconnu',
    confirmedByGmail: 'Expéditeur confirmé par Gmail',
    confirmedByServer: 'Expéditeur confirmé par votre serveur de messagerie',
    checkingSender: 'Vérification de l’expéditeur…',
    unconfirmed: 'Expéditeur non confirmé',
    headersHint:
      'Non disponible. Pour la vérification complète avec SPF, DKIM et DMARC : dans Gmail, ouvrez ⋮ → Afficher l’original → Copier dans le presse-papiers, puis collez-le sous « Vérifier un autre e-mail ».',
    noAuth: 'Aucune dans les en-têtes : l’expéditeur ne peut pas être confirmé.',
    none: 'aucun',
    checkedBy: (server) => `vérifié par ${server}`,
    invalidAddress: 'Adresse web non valide',
    forwardsTo: 'redirige vers',
    moreLinks: (count) => `${count} ${count === 1 ? 'autre lien' : 'autres liens'}`,
    linksTitle: (count) => `Liens (${count})`,
  },

  severity: { danger: 'Danger', warning: 'Attention', info: 'Remarque' },

  flags: {
    nameSays: 'Le nom indique',
    addressIs: 'L’adresse est',
    looksLike: 'Ressemble à',
    is: 'Est',
    says: 'Affiche',
    opens: 'Ouvre',
    moreLikeThis: (count) => `${count} ${count === 1 ? 'autre lien' : 'autres liens'} de ce type.`,
    noNotes: 'Aucune.',
    checkFailed:
      'Les vérifications de base n’ont pas pu aboutir. Traitez cet e-mail avec prudence.',
  },

  titles: {
    'dangerous-link': 'Un lien exécute du code au lieu d’ouvrir une page',
    'hidden-link-target': 'Un lien cache sa vraie destination',
    'ip-link': 'Un lien mène à une simple adresse en chiffres',
    'international-domain': 'Une adresse web utilise les lettres d’un autre alphabet',
    'link-text-mismatch': 'Un lien ne mène pas là où son texte l’indique',
    'redirect-link': 'Un lien passe par un service de redirection',
    'lookalike-domain': 'Une adresse web imite une adresse connue',
    'brand-in-subdomain': 'Un nom connu est placé devant une autre adresse',
    'brand-in-domain': 'Une adresse web contient un nom connu sans être la sienne',
    'sender-name-domain': 'Le nom de l’expéditeur ne correspond pas à l’adresse',
    'sender-name-brand': 'L’expéditeur se réclame d’une marque depuis une autre adresse',
    'hidden-characters': 'Des mots contiennent des caractères invisibles',
    'mixed-script': 'Des mots mélangent des lettres de différents alphabets',
    'direction-override': 'Du texte est écrit à l’envers pour déguiser une adresse',
    'reply-to-mismatch': 'Les réponses iraient à une autre entreprise',
    'dmarc-fail': 'L’adresse de l’expéditeur est falsifiée',
    'auth-fail': 'Le serveur de l’expéditeur n’a pas confirmé cet e-mail',
    'dkim-other-domain': 'Signé par un autre domaine',
    'no-auth-results': 'Aucune vérification de l’expéditeur dans cet e-mail',
    'incomplete-check': 'Une partie de cet e-mail n’a pas pu être vérifiée',
    urgency: 'Pression du temps',
    threat: 'Menace de conséquences',
    credentials: 'Demande des mots de passe, une identité ou des données de carte',
    payment: 'Demande un paiement',
  },

  sentences: {
    'dangerous-link': 'Le lien n’ouvre pas une page web : il lance un programme ou un fichier.',
    'hidden-link-target': 'Un « @ » dans l’adresse cache la vraie destination du lien.',
    'ip-link': 'Le lien mène à une simple adresse en chiffres au lieu d’un nom.',
    'international-domain':
      'L’adresse utilise des lettres qui ressemblent à des lettres connues et peuvent imiter un nom familier.',
    'link-text-mismatch': 'Le texte du lien montre une autre adresse que sa vraie destination.',
    'redirect-link':
      'Le lien passe par un service de redirection ; sa destination finale est inconnue.',
    'lookalike-domain': 'L’adresse ressemble à une adresse connue, mais c’en est une autre.',
    'brand-in-subdomain':
      'Un nom connu figure au début, mais l’adresse appartient à quelqu’un d’autre.',
    'brand-in-domain': 'L’adresse contient un nom connu, mais ne lui appartient pas.',
    'sender-name-domain': 'Le nom affiché indique une autre adresse que celle d’où vient l’e-mail.',
    'sender-name-brand': 'Le nom affiché cite une marque, mais l’adresse ne lui appartient pas.',
    'hidden-characters':
      'Des caractères invisibles se cachent dans des mots, une astuce pour passer les filtres.',
    'mixed-script':
      'Des mots mélangent des lettres latines avec des lettres cyrilliques ou grecques identiques en apparence.',
    'direction-override':
      'Un caractère invisible inverse le sens d’écriture, pour qu’une adresse paraisse autre qu’elle n’est.',
    'reply-to-mismatch': 'Une réponse irait à une autre adresse que celle de l’expéditeur.',
    'dmarc-fail':
      'Le service de messagerie de l’expéditeur indique que cet e-mail ne vient pas de lui. C’est le signe le plus sûr d’un expéditeur falsifié.',
    'auth-fail':
      'Les vérifications qui confirment un expéditeur n’ont pas réussi. De vrais expéditeurs échouent parfois aussi : voyez-y un avertissement, pas une preuve.',
    'dkim-other-domain': 'L’e-mail est signé par un autre domaine que celui de l’expéditeur.',
    'no-auth-results':
      'L’e-mail ne contient aucune vérification de l’expéditeur ; celui-ci ne peut pas être confirmé.',
    'incomplete-check': 'Une partie de l’e-mail n’a pas pu être lue et n’a pas été vérifiée.',
    urgency: 'L’e-mail met la pression sur le temps.',
    threat: 'L’e-mail menace de conséquences.',
    credentials: 'L’e-mail demande des identifiants, une identité ou des données de carte.',
    payment: 'L’e-mail demande un paiement.',
  },

  verdict: {
    word: {
      pending: 'Vérification…',
      safe: 'Semble sûr',
      suspicious: 'Suspect',
      dangerous: 'Dangereux',
      unchecked: 'Aucun signal d’alerte trouvé',
    },
    line: {
      safe: 'Aucun signe d’hameçonnage trouvé.',
      suspicious: 'Prudence : quelques signes d’hameçonnage.',
      dangerous: 'Cela ressemble à de l’hameçonnage.',
      unchecked:
        'Non vérifié par l’IA. Les vérifications de base seules peuvent manquer une arnaque bien faite.',
    },
    advice: {
      safe: 'Restez prudent face aux demandes inattendues : si un e-mail vous demande de vous connecter ou de payer, ouvrez le site vous-même plutôt que d’utiliser ses liens.',
      suspicious:
        'N’entrez ni mot de passe ni données de carte et ne payez pas. Vérifiez auprès de l’expéditeur par un moyen que vous connaissez déjà.',
      dangerous:
        'Ne cliquez sur aucun lien, n’ouvrez aucune pièce jointe et ne répondez pas. Supprimez l’e-mail ou signalez-le comme hameçonnage.',
      unchecked:
        'Restez prudent face aux demandes inattendues : si un e-mail vous demande de vous connecter ou de payer, ouvrez le site vous-même plutôt que d’utiliser ses liens.',
    },
    aiSaid: { safe: 'aucun signe d’hameçonnage', suspicious: 'suspect', dangerous: 'dangereux' },
    sourceDevice: 'Vérifié sur cet appareil',
    sourceRulesOnly: 'Vérifications de base seulement',
    doneIn: (time) => `Terminé en ${time}`,
  },

  judge: {
    theAi: 'l’IA',
    theCloudAi: 'l’IA du cloud',
    said: (ai, level) => `${ai[0]?.toUpperCase() ?? ''}${ai.slice(1)} a répondu : ${level}`,
    lineOnlyNotes: (word) =>
      `${word} (expéditeur confirmé, les vérifications de base n’ont rien trouvé ; remarques de l’IA ci-dessous)`,
    lineStricter: (word, ai, level) =>
      `${word} (vérifications de base ; ${ai} a répondu : ${level})`,
    detailOnlyNotes: (said) =>
      `${said}, mais l’expéditeur est confirmé et les vérifications de base n’ont rien trouvé : ses points ne sont que des remarques.`,
    detailStricter: (said) =>
      `${said} ; les vérifications de base ont trouvé davantage, leur verdict prévaut donc.`,
  },

  aiCheck: {
    starting: 'Démarrage de la vérification par l’IA…',
    waitingHeaders: 'En attente des vérifications de l’expéditeur…',
    running: (secondTry) =>
      `Vérification par l’IA en cours${secondTry ? ' (deuxième essai)' : ''}…`,
    loading: (secondTry) =>
      `Chargement de l’IA locale${secondTry ? ' (deuxième essai)' : ''}… Le premier chargement après un redémarrage de Chrome peut prendre quelques minutes ; le résultat s’affichera ici de lui-même.`,
    waitingPrevious: 'En attente de la vérification de l’e-mail précédent…',
    note: 'IA locale (Gemini Nano). L’IA peut se tromper.',
    experimental: 'Les réponses dans cette langue sont expérimentales.',
    noModel: 'L’IA locale n’est pas prête : seules les vérifications de base ont tourné.',
    stopped: 'La vérification par l’IA a été arrêtée. Les vérifications de base restent valables.',
    failed: (secondTry, detail) =>
      `La vérification par l’IA a échoué${secondTry ? ' après un deuxième essai' : ''} (${detail}). Les vérifications de base restent valables.`,
    unreadable: (secondTry) =>
      `La réponse de l’IA n’a pas pu être lue${secondTry ? ' après un deuxième essai' : ''}. Les vérifications de base restent valables.`,
    unknownError: 'erreur inconnue',
  },

  errors: {
    noAnswerWithin: (seconds) => `pas de réponse en ${seconds} s`,
    modelWrote: (count) => `le modèle avait écrit ${count} caractères`,
    tooLong: (count) => `la réponse ne s’est pas terminée (plus de ${count} caractères)`,
    refused: (status) => `le cloud a refusé la requête (HTTP ${status})`,
    cloudFailed: 'la requête au cloud a échoué',
    offline: 'pas de connexion au cloud',
    tokenNoAnswer: (name) => `pas de réponse du serveur de jetons (${name})`,
    tokenRefused: (status) => `le serveur de jetons a refusé (HTTP ${status})`,
    signInFailed: (code) => `échec de la connexion (${code})`,
  },

  deepCheck: {
    notAvailable: 'Non disponible dans cette version.',
    waitingHeaders: 'En attente des vérifications de l’expéditeur…',
    recommendedExperimental: (language) =>
      `Recommandé : les réponses de l’IA locale en ${language} sont expérimentales.`,
    recommendedUnchecked: 'Recommandé : l’IA locale n’a pas vérifié cet e-mail.',
    chips: {
      names: (count) => plural(count, 'nom', 'noms'),
      emails: (count) => plural(count, 'adresse e-mail', 'adresses e-mail'),
      numbers: (count) => plural(count, 'numéro', 'numéros'),
      ibans: (count) => plural(count, 'IBAN', 'IBAN'),
      links: (count) => plural(count, 'chemin de lien', 'chemins de lien'),
      nothing: 'Aucune donnée personnelle trouvée',
      namesKept: 'Noms conservés',
    },
    changed: {
      idle: '',
      preparing:
        'L’e-mail a changé, l’analyse approfondie a donc été arrêtée. Rien n’a été envoyé.',
      preview:
        'L’e-mail a changé, les données préparées ont donc été écartées. Rien n’a été envoyé.',
      sending:
        'L’e-mail a changé pendant l’analyse approfondie : ses données avaient été envoyées, la réponse a été ignorée.',
      done: 'L’e-mail a changé, le résultat de l’analyse approfondie a donc été effacé.',
    },
    waitingModel: 'En attente de l’IA locale…',
    lookingForNames: 'Recherche de noms sur cet appareil…',
    prepareFailed: 'L’analyse approfondie n’a pas pu préparer ses données. Rien n’a été envoyé.',
    stopped:
      'L’analyse approfondie a été arrêtée. Les données affichées ont peut-être déjà atteint le cloud ; vous pouvez les renvoyer.',
    limit:
      'L’analyse approfondie a atteint sa limite du jour. Rien n’a été envoyé ; le résultat ci-dessus reste valable.',
    unreadable:
      'La réponse du cloud n’a pas pu être lue. Le résultat ci-dessus reste valable ; vous pouvez renvoyer les données.',
    failed:
      'L’analyse approfondie n’a pas fonctionné. Le résultat ci-dessus reste valable ; vous pouvez renvoyer les données.',
    failedDetail: (detail) => `La requête au cloud a échoué : ${detail}.`,
    resultWord: (word) => `Analyse approfondie : ${word}`,
    source: 'Vérifié dans le cloud',
    note: (time) => `Cloud (Gemini via Firebase AI Logic). L’IA peut se tromper. ${time}.`,
    sentOnce: 'Envoyé une fois, pour cette analyse seulement.',
    checking: 'Vérification dans le cloud…',
    showFailed: 'Le résultat de l’analyse approfondie n’a pas pu être affiché.',
    levelChanged:
      'Le nouveau niveau de confidentialité s’applique à la prochaine analyse approfondie. Les données ci-dessus ont été envoyées au niveau précédent.',
    nothingSent: 'Rien n’a été envoyé.',
    stoppedNothingSent: 'Arrêté. Rien n’a été envoyé.',
  },
};
