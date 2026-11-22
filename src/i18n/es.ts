/* Spanish. Same keys and parameters as en.ts (the master copy); plain words in tiers 1 and 2. */
import type { Messages } from './en';

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export const es: Messages = {
  html: {
    starting: 'Iniciando…',
    modelLoading: 'IA en el dispositivo cargando',
    downloadLabel: 'Descarga de la IA en el dispositivo',
    downloadNow: 'Descargar ahora',
    emptyHeading: 'Abre un correo en Gmail',
    emptyText:
      'PhishLocal lo revisa aquí, automáticamente, mientras este panel está abierto. El correo nunca sale de tu navegador.',
    pasteOpen: 'Pegar un correo',
    privacyTitle: 'Cómo se protege tu privacidad',
    pointDeviceLead: 'Revisado en este dispositivo',
    pointDeviceText:
      'Revisiones básicas más Gemini Nano, la IA integrada en Chrome. Funciona sin conexión.',
    pointSavedLead: 'No se guarda ningún correo',
    pointSavedText: 'Cierra el panel y toda lectura se detiene.',
    pointCloudLead: 'Nube solo si lo pides',
    pointCloudText: 'Primero se eliminan los datos personales, y ves lo que se envía.',
    languages: 'Idiomas: en · de · fr · es · it · pt',
    howItWorks: 'Cómo funciona',
    emailLabel: 'Correo',
    senderUnconfirmed: 'Remitente no confirmado',
    readAgain: 'Revisar de nuevo el correo abierto',
    resultLabel: 'Resultado',
    stop: 'Detener',
    redFlags: 'Señales de alerta',
    links: 'Enlaces',
    moreLinks: 'Más enlaces',
    deepCheckLabel: 'Revisión a fondo en la nube',
    deepCheckStart: 'Revisión a fondo en la nube…',
    backToResult: 'Volver al resultado',
    deepCheckTitle: 'Revisión a fondo en la nube',
    deepCheckIntro:
      'Un modelo más grande en la nube revisa de nuevo. Primero se eliminan los datos personales en este dispositivo.',
    nothingSentYet: 'Todavía no se ha enviado nada.',
    privacyLevel: 'Nivel de privacidad',
    levelStandard: 'Estándar',
    levelHigh: 'Alto',
    removes: 'Elimina:',
    removesEmails: 'Direcciones de correo',
    removesNumbers: 'Números de teléfono, tarjeta, cuenta y cliente',
    removesIbans: 'IBAN',
    removesLinkPaths: 'Rutas de los enlaces (el nombre del sitio se mantiene)',
    removesStandard: 'Todo lo de Estándar',
    removesNames: 'Nombres de personas',
    removedOnDevice: 'Eliminado en este dispositivo',
    neverSent:
      'Nunca se envía: tu dirección, los encabezados sin procesar, las direcciones IP de los servidores.',
    namesMayRemain:
      'Puede que aún queden nombres en el texto: lee lo que se enviará antes de enviarlo.',
    showData: 'Mostrar lo que se enviará',
    dataLabel: 'Datos que se enviarán a la nube',
    dataExactly:
      'Exactamente este texto va a la nube, con las instrucciones fijas de PhishLocal y nada más.',
    send: 'Enviar a la nube',
    cancel: 'Cancelar',
    sentOnce: 'Se envía una vez, solo para esta revisión, a Gemini mediante Firebase AI Logic.',
    emailDetails: 'Detalles del correo',
    from: 'De',
    subject: 'Asunto',
    senderChecks: 'Comprobaciones del remitente',
    aiAndBasic: 'IA y revisiones básicas',
    deepCheck: 'Revisión a fondo',
    notes: 'Notas',
    text: 'Texto',
    checkAnother: 'Revisar otro correo',
    pasteIntro:
      'Pega un correo de cualquier aplicación de correo, o su código fuente («Mostrar original»). Se queda en este dispositivo.',
    fromOptional: 'De (opcional)',
    senderPlaceholder: 'Nombre <dirección>',
    subjectOptional: 'Asunto (opcional)',
    emailText: 'Texto del correo',
    usePasted: 'Revisar el correo pegado',
    clear: 'Borrar',
    sampleLabel: 'O cargar un ejemplo inventado',
    chooseSample: 'Elige un ejemplo…',
    load: 'Cargar',
    settings: 'Ajustes',
    language: 'Idioma',
    languageHint:
      'Define el idioma del panel y de las respuestas de la IA. El panel se reinicia para cambiar.',
  },

  automatic: (name) => `Automático (${name})`,
  languageNames: {
    en: 'inglés',
    de: 'alemán',
    fr: 'francés',
    es: 'español',
    it: 'italiano',
    pt: 'portugués',
  },

  pill: {
    loading: 'IA en el dispositivo cargando',
    ready: 'IA en el dispositivo lista',
    downloading: 'IA en el dispositivo',
    'not-downloaded': 'IA no instalada',
    unavailable: 'IA no disponible',
    failed: 'IA no cargada',
  },

  banner: {
    'not-downloaded': {
      title: 'Instalar la IA en el dispositivo',
      text: 'Chrome descarga Gemini Nano una sola vez, unos 4 GB. Después, los correos se revisan en este dispositivo, también sin conexión. Hasta entonces solo reciben las revisiones básicas.',
    },
    downloading: {
      title: 'Instalando la IA en el dispositivo',
      text: 'Chrome está descargando Gemini Nano. Las revisiones básicas ya funcionan mientras esperas, y puedes seguir usando Gmail.',
    },
    unavailable: {
      title: 'La IA en el dispositivo no está disponible en este ordenador',
      text: 'Chrome no puede ejecutar Gemini Nano aquí. Los correos solo reciben las revisiones básicas; la revisión a fondo en la nube sigue funcionando donde se ofrece.',
    },
    failed: {
      title: 'La IA en el dispositivo no se pudo cargar',
      text: 'Chrome no pudo cargar Gemini Nano. Los correos solo reciben las revisiones básicas; la próxima revisión lo intenta de nuevo.',
    },
    downloadFailed: (reason) => `La descarga falló (${reason}).`,
  },

  empty: {
    idle: {
      heading: 'Abre un correo en Gmail',
      text: 'PhishLocal lo revisa aquí, automáticamente, mientras este panel está abierto. El correo nunca sale de tu navegador.',
    },
    'not-gmail': {
      heading: 'Abre Gmail en esta pestaña',
      text: 'PhishLocal revisa los correos que abres en Gmail, automáticamente, mientras este panel está abierto. Si Gmail ya estaba abierto antes de instalar o actualizar PhishLocal, recarga la pestaña de Gmail. También puedes pegar un correo de cualquier aplicación de correo.',
    },
    unreadable: {
      heading: 'No se pudo leer este correo',
      text: 'Puede que Gmail haya cambiado su página. Puedes pegar el correo en su lugar.',
    },
  },

  gmail: {
    checked: 'Revisado automáticamente en este dispositivo.',
    headersRead: 'Comprobaciones del remitente leídas de Gmail.',
    headersLoading: 'Cargando las comprobaciones del remitente…',
    headersNote: 'Cargando desde Gmail…',
    headersMissing: (reason) => `Comprobaciones del remitente no disponibles: ${reason}.`,
    failures: {
      'no-account-key': 'la página de Gmail ha cambiado',
      'no-message-id': 'la página de Gmail ha cambiado',
      'request-failed': 'Gmail no las entregó',
      timeout: 'Gmail no respondió a tiempo',
      unreadable: 'no se pudo leer la página de Gmail',
    },
    idle: 'Abre un correo en Gmail: mientras este panel está abierto, PhishLocal lo revisa automáticamente, en este dispositivo.',
    notGmail:
      'Abre Gmail en esta pestaña para revisar los correos automáticamente. Si Gmail ya estaba abierto antes de instalar o actualizar PhishLocal, recarga la pestaña de Gmail.',
    unreadable: 'No se pudo leer este correo. Puede que Gmail haya cambiado su página.',
    textCut: 'El texto es largo y se recortó.',
  },

  paste: {
    rawRead: 'Código fuente leído, con sus encabezados. Nada salió de tu navegador.',
    ready: 'Correo pegado listo. Nada salió de tu navegador.',
    sampleLoaded: (label) => `Ejemplo cargado: ${label}. Es inventado.`,
    emptyText: 'Pega primero el texto del correo.',
    chooseSample: 'Elige primero un ejemplo.',
    rawTooLarge: 'El código fuente supera los 5 MB.',
    rawUnreadable: 'No se pudo leer el código fuente.',
  },

  email: {
    noSubject: '(sin asunto)',
    unknownSender: 'Remitente desconocido',
    confirmedByGmail: 'Remitente confirmado por Gmail',
    confirmedByServer: 'Remitente confirmado por tu servidor de correo',
    checkingSender: 'Comprobando el remitente…',
    unconfirmed: 'Remitente no confirmado',
    headersHint:
      'No disponible. Para la revisión completa con SPF, DKIM y DMARC: en Gmail, abre ⋮ → Mostrar original → Copiar al portapapeles, y pégalo en «Revisar otro correo».',
    noAuth: 'Ninguna en los encabezados: no se puede confirmar el remitente.',
    none: 'ninguno',
    checkedBy: (server) => `comprobado por ${server}`,
    invalidAddress: 'No es una dirección web válida',
    forwardsTo: 'redirige a',
    moreLinks: (count) => `${count} ${count === 1 ? 'enlace más' : 'enlaces más'}`,
    linksTitle: (count) => `Enlaces (${count})`,
  },

  severity: { danger: 'Peligro', warning: 'Aviso', info: 'Nota' },

  flags: {
    nameSays: 'El nombre dice',
    addressIs: 'La dirección es',
    looksLike: 'Se parece a',
    is: 'Es',
    says: 'Muestra',
    opens: 'Abre',
    moreLikeThis: (count) => `${count} ${count === 1 ? 'enlace más' : 'enlaces más'} como este.`,
    noNotes: 'Ninguna.',
    checkFailed: 'Las revisiones básicas no pudieron terminar. Trata este correo con cuidado.',
  },

  titles: {
    'dangerous-link': 'Un enlace ejecuta código en vez de abrir una página',
    'hidden-link-target': 'Un enlace oculta adónde lleva realmente',
    'ip-link': 'Un enlace lleva a una dirección hecha solo de números',
    'international-domain': 'Una dirección web usa letras de otro alfabeto',
    'link-text-mismatch': 'Un enlace no lleva adonde dice su texto',
    'redirect-link': 'Un enlace pasa por un servicio de redirección',
    'lookalike-domain': 'Una dirección web imita a una conocida',
    'brand-in-subdomain': 'Un nombre conocido aparece delante de otra dirección',
    'brand-in-domain': 'Una dirección web contiene un nombre conocido, pero no es la suya',
    'sender-name-domain': 'El nombre del remitente no coincide con la dirección',
    'sender-name-brand': 'El remitente dice ser una marca desde otra dirección',
    'hidden-characters': 'Hay palabras con caracteres invisibles',
    'mixed-script': 'Hay palabras que mezclan letras de distintos alfabetos',
    'direction-override': 'Hay texto escrito al revés para disfrazar una dirección',
    'reply-to-mismatch': 'Las respuestas irían a otra empresa',
    'dmarc-fail': 'La dirección del remitente es falsa',
    'auth-fail': 'El servidor del remitente no confirmó este correo',
    'dkim-other-domain': 'Firmado por otro dominio',
    'no-auth-results': 'Este correo no tiene comprobaciones del remitente',
    'incomplete-check': 'Parte de este correo no se pudo revisar',
    urgency: 'Presión de tiempo',
    threat: 'Amenaza con consecuencias',
    credentials: 'Pide contraseñas, identidad o datos de tarjeta',
    payment: 'Pide un pago',
  },

  sentences: {
    'dangerous-link': 'El enlace no abre una página web: inicia un programa o un archivo.',
    'hidden-link-target': 'Una «@» en la dirección oculta adónde lleva realmente el enlace.',
    'ip-link': 'El enlace lleva a una dirección hecha solo de números en vez de un nombre.',
    'international-domain':
      'La dirección usa letras que se parecen a letras conocidas y pueden imitar un nombre familiar.',
    'link-text-mismatch': 'El texto del enlace muestra otra dirección que su destino real.',
    'redirect-link':
      'El enlace pasa por un servicio de redirección; su destino final es desconocido.',
    'lookalike-domain': 'La dirección se parece a una conocida, pero es otra.',
    'brand-in-subdomain': 'Un nombre conocido va delante, pero la dirección es de otra persona.',
    'brand-in-domain': 'La dirección contiene un nombre conocido, pero no le pertenece.',
    'sender-name-domain':
      'El nombre que se muestra indica otra dirección distinta de la que envía el correo.',
    'sender-name-brand': 'El nombre que se muestra cita una marca, pero la dirección no es suya.',
    'hidden-characters':
      'Hay caracteres invisibles dentro de palabras, un truco para pasar los filtros.',
    'mixed-script':
      'Hay palabras que mezclan letras latinas con letras cirílicas o griegas de igual aspecto.',
    'direction-override':
      'Un carácter invisible invierte la dirección del texto, para que una dirección parezca otra.',
    'reply-to-mismatch': 'Una respuesta iría a otra dirección distinta de la del remitente.',
    'dmarc-fail':
      'El servicio de correo del remitente dice que este correo no viene de él. Es la señal más segura de un remitente falso.',
    'auth-fail':
      'Las comprobaciones que confirman a un remitente no se superaron. A veces también fallan remitentes reales: tómalo como aviso, no como prueba.',
    'dkim-other-domain': 'El correo está firmado por un dominio distinto del del remitente.',
    'no-auth-results':
      'El correo no incluye comprobaciones del remitente; no se puede confirmar quién lo envía.',
    'incomplete-check': 'Parte del correo no se pudo leer y no se revisó.',
    urgency: 'El correo mete prisa.',
    threat: 'El correo amenaza con consecuencias.',
    credentials: 'El correo pide datos de acceso, identidad o datos de tarjeta.',
    payment: 'El correo pide un pago.',
  },

  verdict: {
    word: {
      pending: 'Revisando…',
      safe: 'Parece seguro',
      suspicious: 'Sospechoso',
      dangerous: 'Peligroso',
      unchecked: 'No se encontraron señales de alerta',
    },
    line: {
      safe: 'No se encontraron señales de phishing.',
      suspicious: 'Cuidado: algunas señales de phishing.',
      dangerous: 'Esto parece phishing.',
      unchecked:
        'No revisado por la IA. Las revisiones básicas solas pueden pasar por alto una estafa bien hecha.',
    },
    advice: {
      safe: 'Sigue con cuidado ante peticiones inesperadas: si un correo te pide iniciar sesión o pagar, abre tú mismo el sitio en lugar de usar sus enlaces.',
      suspicious:
        'No introduzcas contraseñas ni datos de tarjeta y no pagues. Consulta al remitente por una vía que ya conozcas.',
      dangerous:
        'No hagas clic en enlaces, no abras adjuntos ni respondas. Borra el correo o denúncialo como phishing.',
      unchecked:
        'Sigue con cuidado ante peticiones inesperadas: si un correo te pide iniciar sesión o pagar, abre tú mismo el sitio en lugar de usar sus enlaces.',
    },
    aiSaid: { safe: 'sin señales de phishing', suspicious: 'sospechoso', dangerous: 'peligroso' },
    sourceDevice: 'Revisado en este dispositivo',
    sourceRulesOnly: 'Solo revisiones básicas',
    doneIn: (time) => `Hecho en ${time}`,
  },

  judge: {
    theAi: 'la IA',
    theCloudAi: 'la IA de la nube',
    said: (ai, level) => `${ai[0]?.toUpperCase() ?? ''}${ai.slice(1)} dijo: ${level}`,
    lineOnlyNotes: (word) =>
      `${word} (remitente confirmado, las revisiones básicas no encontraron nada; notas de la IA abajo)`,
    lineStricter: (word, ai, level) => `${word} (revisiones básicas; ${ai} dijo: ${level})`,
    detailOnlyNotes: (said) =>
      `${said}, pero el remitente está confirmado y las revisiones básicas no encontraron nada, así que sus puntos son solo notas.`,
    detailStricter: (said) =>
      `${said}; las revisiones básicas encontraron más, así que su veredicto se mantiene.`,
  },

  aiCheck: {
    starting: 'Iniciando la revisión de la IA…',
    waitingHeaders: 'Esperando las comprobaciones del remitente…',
    running: (secondTry) => `Revisión de la IA en curso${secondTry ? ' (segundo intento)' : ''}…`,
    loading: (secondTry) =>
      `IA en el dispositivo cargando${secondTry ? ' (segundo intento)' : ''}… La primera carga tras reiniciar Chrome puede tardar unos minutos; el resultado aparecerá aquí solo.`,
    waitingPrevious: 'Esperando la revisión del correo anterior…',
    note: 'IA en el dispositivo (Gemini Nano). La IA puede equivocarse.',
    experimental: 'Las respuestas en este idioma son experimentales.',
    noModel:
      'La IA en el dispositivo no está lista, así que solo se hicieron las revisiones básicas.',
    stopped: 'La revisión de la IA se detuvo. Las revisiones básicas siguen valiendo.',
    failed: (secondTry, detail) =>
      `La revisión de la IA falló${secondTry ? ' tras un segundo intento' : ''} (${detail}). Las revisiones básicas siguen valiendo.`,
    unreadable: (secondTry) =>
      `No se pudo leer la respuesta de la IA${secondTry ? ' tras un segundo intento' : ''}. Las revisiones básicas siguen valiendo.`,
    unknownError: 'error desconocido',
  },

  errors: {
    noAnswerWithin: (seconds) => `sin respuesta en ${seconds} s`,
    modelWrote: (count) => `el modelo había escrito ${count} caracteres`,
    tooLong: (count) => `la respuesta no terminó (más de ${count} caracteres)`,
    refused: (status) => `la nube rechazó la petición (HTTP ${status})`,
    cloudFailed: 'la petición a la nube falló',
    offline: 'sin conexión con la nube',
    tokenNoAnswer: (name) => `sin respuesta del servidor de tokens (${name})`,
    tokenRefused: (status) => `el servidor de tokens rechazó la petición (HTTP ${status})`,
    signInFailed: (code) => `falló el inicio de sesión (${code})`,
  },

  deepCheck: {
    notAvailable: 'No disponible en esta versión.',
    waitingHeaders: 'Esperando las comprobaciones del remitente…',
    recommendedExperimental: (language) =>
      `Recomendado: las respuestas en el dispositivo en ${language} son experimentales.`,
    recommendedUnchecked: 'Recomendado: la IA en el dispositivo no revisó este correo.',
    chips: {
      names: (count) => plural(count, 'nombre', 'nombres'),
      emails: (count) => plural(count, 'dirección de correo', 'direcciones de correo'),
      numbers: (count) => plural(count, 'número', 'números'),
      ibans: (count) => plural(count, 'IBAN', 'IBAN'),
      links: (count) => plural(count, 'ruta de enlace', 'rutas de enlace'),
      nothing: 'No se encontraron datos personales',
      namesKept: 'Nombres conservados',
    },
    changed: {
      idle: '',
      preparing: 'El correo cambió, así que la revisión a fondo se detuvo. No se envió nada.',
      preview: 'El correo cambió, así que se descartaron los datos preparados. No se envió nada.',
      sending:
        'El correo cambió durante la revisión a fondo: sus datos ya se habían enviado, la respuesta se descartó.',
      done: 'El correo cambió, así que se borró el resultado de la revisión a fondo.',
    },
    waitingModel: 'Esperando la IA en el dispositivo…',
    lookingForNames: 'Buscando nombres en este dispositivo…',
    prepareFailed: 'La revisión a fondo no pudo preparar sus datos. No se envió nada.',
    stopped:
      'La revisión a fondo se detuvo. Puede que los datos mostrados ya hayan llegado a la nube; puedes enviarlos de nuevo.',
    limit:
      'La revisión a fondo alcanzó su límite de hoy. No se envió nada; el resultado de arriba sigue valiendo.',
    unreadable:
      'No se pudo leer la respuesta de la nube. El resultado de arriba sigue valiendo; puedes enviar los datos de nuevo.',
    failed:
      'La revisión a fondo no funcionó. El resultado de arriba sigue valiendo; puedes enviar los datos de nuevo.',
    failedDetail: (detail) => `La petición a la nube falló: ${detail}.`,
    resultWord: (word) => `Revisión a fondo: ${word}`,
    source: 'Revisado en la nube',
    note: (time) => `Nube (Gemini mediante Firebase AI Logic). La IA puede equivocarse. ${time}.`,
    sentOnce: 'Enviado una vez, solo para esta revisión.',
    checking: 'Revisando en la nube…',
    showFailed: 'No se pudo mostrar el resultado de la revisión a fondo.',
    levelChanged:
      'El nuevo nivel de privacidad se aplica a la próxima revisión a fondo. Los datos de arriba se enviaron con el nivel anterior.',
    nothingSent: 'No se envió nada.',
    stoppedNothingSent: 'Detenido. No se envió nada.',
  },
};
