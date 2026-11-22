/* Portuguese. Same keys and parameters as en.ts (the master copy); plain words in tiers 1 and 2. */
import type { Messages } from './en';

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export const pt: Messages = {
  html: {
    starting: 'A iniciar…',
    modelLoading: 'A carregar a IA local',
    downloadLabel: 'Transferência da IA local',
    downloadNow: 'Transferir agora',
    emptyHeading: 'Abra um e-mail no Gmail',
    emptyText:
      'O PhishLocal verifica-o aqui, automaticamente, enquanto este painel está aberto. O e-mail nunca sai do seu navegador.',
    pasteOpen: 'Colar um e-mail',
    privacyTitle: 'Como a sua privacidade é protegida',
    pointDeviceLead: 'Verificado neste dispositivo',
    pointDeviceText:
      'Verificações básicas mais o Gemini Nano, a IA integrada no Chrome. Funciona offline.',
    pointSavedLead: 'Nenhum e-mail é guardado',
    pointSavedText: 'Feche o painel e toda a leitura para.',
    pointCloudLead: 'Nuvem só se pedir',
    pointCloudText: 'Os dados pessoais são removidos primeiro, e vê o que é enviado.',
    languages: 'Idiomas: en · de · fr · es · it · pt',
    howItWorks: 'Como funciona',
    emailLabel: 'E-mail',
    senderUnconfirmed: 'Remetente não confirmado',
    readAgain: 'Verificar de novo o e-mail aberto',
    resultLabel: 'Resultado',
    stop: 'Parar',
    redFlags: 'Sinais de alerta',
    links: 'Ligações',
    moreLinks: 'Mais ligações',
    deepCheckLabel: 'Verificação aprofundada na nuvem',
    deepCheckStart: 'Verificação aprofundada na nuvem…',
    backToResult: 'Voltar ao resultado',
    deepCheckTitle: 'Verificação aprofundada na nuvem',
    deepCheckIntro:
      'Um modelo maior na nuvem verifica de novo. Os dados pessoais são primeiro removidos neste dispositivo.',
    nothingSentYet: 'Ainda não foi enviado nada.',
    privacyLevel: 'Nível de privacidade',
    levelStandard: 'Padrão',
    levelHigh: 'Alto',
    removes: 'Remove:',
    removesEmails: 'Endereços de e-mail',
    removesNumbers: 'Números de telefone, cartão, conta e cliente',
    removesIbans: 'IBAN',
    removesLinkPaths: 'Caminhos das ligações (o nome do site fica)',
    removesStandard: 'Tudo o que o Padrão remove',
    removesNames: 'Nomes de pessoas',
    removedOnDevice: 'Removido neste dispositivo',
    neverSent:
      'Nunca enviados: o seu endereço, os cabeçalhos em bruto, os endereços IP dos servidores.',
    namesMayRemain:
      'Alguns nomes podem ainda estar no texto: leia o que vai ser enviado antes de o enviar.',
    showData: 'Mostrar o que vai ser enviado',
    dataLabel: 'Dados que vão ser enviados para a nuvem',
    dataExactly:
      'Exatamente este texto vai para a nuvem, com as instruções fixas do PhishLocal e nada mais.',
    send: 'Enviar para a nuvem',
    cancel: 'Cancelar',
    sentOnce: 'Enviado uma vez, só para esta verificação, ao Gemini através do Firebase AI Logic.',
    emailDetails: 'Detalhes do e-mail',
    from: 'De',
    subject: 'Assunto',
    senderChecks: 'Verificações do remetente',
    aiAndBasic: 'IA e verificações básicas',
    deepCheck: 'Verificação aprofundada',
    notes: 'Notas',
    text: 'Texto',
    checkAnother: 'Verificar outro e-mail',
    pasteIntro:
      'Cole um e-mail de qualquer aplicação de correio, ou o seu código-fonte («Mostrar original»). Fica neste dispositivo.',
    fromOptional: 'De (opcional)',
    senderPlaceholder: 'Nome <endereço>',
    subjectOptional: 'Assunto (opcional)',
    emailText: 'Texto do e-mail',
    usePasted: 'Verificar o e-mail colado',
    clear: 'Limpar',
    sampleLabel: 'Ou carregar um exemplo inventado',
    chooseSample: 'Escolha um exemplo…',
    load: 'Carregar',
    settings: 'Definições',
    language: 'Idioma',
    languageHint: 'Define o idioma do painel e das respostas da IA. O painel reinicia para mudar.',
  },

  automatic: (name) => `Automático (${name})`,
  languageNames: {
    en: 'inglês',
    de: 'alemão',
    fr: 'francês',
    es: 'espanhol',
    it: 'italiano',
    pt: 'português',
  },

  pill: {
    loading: 'A carregar a IA local',
    ready: 'IA local pronta',
    downloading: 'IA local',
    'not-downloaded': 'IA não instalada',
    unavailable: 'IA não disponível',
    failed: 'IA não carregada',
  },

  banner: {
    'not-downloaded': {
      title: 'Instalar a IA local',
      text: 'O Chrome transfere o Gemini Nano uma única vez, cerca de 4 GB. Depois, os e-mails são verificados neste dispositivo, também offline. Até lá recebem apenas as verificações básicas.',
    },
    downloading: {
      title: 'A instalar a IA local',
      text: 'O Chrome está a transferir o Gemini Nano. As verificações básicas já funcionam enquanto espera, e pode continuar a usar o Gmail.',
    },
    unavailable: {
      title: 'A IA local não está disponível neste computador',
      text: 'O Chrome não consegue executar o Gemini Nano aqui. Os e-mails recebem apenas as verificações básicas; a verificação aprofundada na nuvem continua a funcionar onde é oferecida.',
    },
    failed: {
      title: 'Não foi possível carregar a IA local',
      text: 'O Chrome não conseguiu carregar o Gemini Nano. Os e-mails recebem apenas as verificações básicas; a próxima verificação tenta de novo.',
    },
    downloadFailed: (reason) => `A transferência falhou (${reason}).`,
  },

  empty: {
    idle: {
      heading: 'Abra um e-mail no Gmail',
      text: 'O PhishLocal verifica-o aqui, automaticamente, enquanto este painel está aberto. O e-mail nunca sai do seu navegador.',
    },
    'not-gmail': {
      heading: 'Abra o Gmail neste separador',
      text: 'O PhishLocal verifica os e-mails que abre no Gmail, automaticamente, enquanto este painel está aberto. Se o Gmail já estava aberto antes de o PhishLocal ser instalado ou atualizado, recarregue o separador do Gmail. Também pode colar um e-mail de qualquer aplicação de correio.',
    },
    unreadable: {
      heading: 'Não foi possível ler este e-mail',
      text: 'O Gmail pode ter mudado a sua página. Pode colar o e-mail em alternativa.',
    },
  },

  gmail: {
    headersNote: 'A carregar do Gmail…',
    headersMissing: (reason) =>
      `Não foi possível carregar as verificações do remetente: ${reason}.`,
    failures: {
      'no-account-key': 'a página do Gmail mudou',
      'no-message-id': 'a página do Gmail mudou',
      'request-failed': 'o Gmail não as entregou',
      timeout: 'o Gmail não respondeu a tempo',
      unreadable: 'não foi possível ler a página do Gmail',
    },
    idle: 'Abra um e-mail no Gmail: enquanto este painel está aberto, o PhishLocal verifica-o automaticamente, neste dispositivo.',
    notGmail:
      'Abra o Gmail neste separador para verificar e-mails automaticamente. Se o Gmail já estava aberto antes de o PhishLocal ser instalado ou atualizado, recarregue o separador do Gmail.',
    unreadable: 'Não foi possível ler este e-mail. O Gmail pode ter mudado a sua página.',
    textCut: 'O e-mail é longo: só a primeira parte foi verificada.',
  },

  paste: {
    rawRead: 'E-mail colado, com os cabeçalhos.',
    ready: 'E-mail colado.',
    sampleLoaded: (label) => `Exemplo carregado: ${label}. É inventado.`,
    emptyText: 'Cole primeiro o texto do e-mail.',
    chooseSample: 'Escolha primeiro um exemplo.',
    rawTooLarge: 'O código-fonte tem mais de 5 MB.',
    rawUnreadable: 'Não foi possível ler o código-fonte.',
  },

  email: {
    noSubject: '(sem assunto)',
    unknownSender: 'Remetente desconhecido',
    confirmedByGmail: 'Remetente confirmado pelo Gmail',
    confirmedByServer: 'Remetente confirmado pelo seu servidor de correio',
    checkingSender: 'A verificar o remetente…',
    unconfirmed: 'Remetente não confirmado',
    headersHint:
      'Não disponível. Para a verificação completa com SPF, DKIM e DMARC: no Gmail, abra ⋮ → Mostrar original → Copiar para a área de transferência, e cole-o em «Verificar outro e-mail».',
    noAuth: 'Nenhuma nos cabeçalhos: o remetente não pode ser confirmado.',
    none: 'nenhum',
    checkedBy: (server) => `verificado por ${server}`,
    invalidAddress: 'Endereço web inválido',
    forwardsTo: 'reencaminha para',
    moreLinks: (count) => `mais ${count} ${count === 1 ? 'ligação' : 'ligações'}`,
    linksTitle: (count) => `Ligações (${count})`,
  },

  severity: { danger: 'Perigo', warning: 'Aviso', info: 'Nota' },

  flags: {
    nameSays: 'O nome diz',
    addressIs: 'O endereço é',
    looksLike: 'Parece',
    is: 'É',
    says: 'Mostra',
    opens: 'Abre',
    moreLikeThis: (count) => `Mais ${count} ${count === 1 ? 'ligação' : 'ligações'} como esta.`,
    noNotes: 'Nenhuma.',
    checkFailed: 'As verificações básicas não conseguiram terminar. Trate este e-mail com cuidado.',
  },

  titles: {
    'dangerous-link': 'Uma ligação executa código em vez de abrir uma página',
    'hidden-link-target': 'Uma ligação esconde para onde vai realmente',
    'ip-link': 'Uma ligação vai para um endereço feito só de números',
    'international-domain': 'Um endereço web usa letras de outro alfabeto',
    'link-text-mismatch': 'Uma ligação não vai para onde o seu texto diz',
    'redirect-link': 'Uma ligação passa por um serviço de reencaminhamento',
    'lookalike-domain': 'Um endereço web imita um conhecido',
    'brand-in-subdomain': 'Um nome conhecido aparece à frente de outro endereço',
    'brand-in-domain': 'Um endereço web contém um nome conhecido, mas não é o dele',
    'sender-name-domain': 'O nome do remetente não corresponde ao endereço',
    'sender-name-brand': 'O remetente diz ser uma marca a partir de outro endereço',
    'hidden-characters': 'Há palavras com caracteres invisíveis',
    'mixed-script': 'Há palavras que misturam letras de alfabetos diferentes',
    'direction-override': 'Há texto escrito ao contrário para disfarçar um endereço',
    'reply-to-mismatch': 'As respostas iriam para outra empresa',
    'dmarc-fail': 'O endereço do remetente é falsificado',
    'auth-fail': 'O servidor do remetente não confirmou este e-mail',
    'dkim-other-domain': 'Assinado por outro domínio',
    'no-auth-results': 'Este e-mail não tem verificações do remetente',
    'incomplete-check': 'Parte deste e-mail não pôde ser verificada',
    urgency: 'Pressão de tempo',
    threat: 'Ameaça com consequências',
    credentials: 'Pede palavras-passe, identidade ou dados do cartão',
    payment: 'Pede um pagamento',
  },

  sentences: {
    'dangerous-link': 'A ligação não abre uma página web: inicia um programa ou um ficheiro.',
    'hidden-link-target': 'Um «@» no endereço esconde para onde a ligação vai realmente.',
    'ip-link': 'A ligação vai para um endereço feito só de números em vez de um nome.',
    'international-domain':
      'O endereço usa letras parecidas com letras conhecidas, que podem imitar um nome familiar.',
    'link-text-mismatch': 'O texto da ligação mostra outro endereço que não o destino real.',
    'redirect-link':
      'A ligação passa por um serviço de reencaminhamento; o destino final é desconhecido.',
    'lookalike-domain': 'O endereço parece um conhecido, mas é outro.',
    'brand-in-subdomain': 'Um nome conhecido vem à frente, mas o endereço é de outra pessoa.',
    'brand-in-domain': 'O endereço contém um nome conhecido, mas não lhe pertence.',
    'sender-name-domain':
      'O nome apresentado indica outro endereço que não aquele de onde vem o e-mail.',
    'sender-name-brand': 'O nome apresentado cita uma marca, mas o endereço não é dela.',
    'hidden-characters':
      'Há caracteres invisíveis dentro de palavras, um truque para passar pelos filtros.',
    'mixed-script':
      'Há palavras que misturam letras latinas com letras cirílicas ou gregas de aspeto igual.',
    'direction-override':
      'Um carácter invisível inverte o sentido do texto, para um endereço parecer outro.',
    'reply-to-mismatch': 'Uma resposta iria para outro endereço que não o do remetente.',
    'dmarc-fail':
      'O serviço de correio do remetente diz que este e-mail não veio dele. É o sinal mais seguro de um remetente falsificado.',
    'auth-fail':
      'As verificações que confirmam um remetente não passaram. Remetentes verdadeiros também falham às vezes: veja isto como aviso, não como prova.',
    'dkim-other-domain': 'O e-mail está assinado por um domínio diferente do do remetente.',
    'no-auth-results':
      'O e-mail não inclui verificações do remetente; não é possível confirmar quem o enviou.',
    'incomplete-check': 'Parte do e-mail não pôde ser lida e não foi verificada.',
    urgency: 'O e-mail cria pressão de tempo.',
    threat: 'O e-mail ameaça com consequências.',
    credentials: 'O e-mail pede dados de acesso, identidade ou dados do cartão.',
    payment: 'O e-mail pede um pagamento.',
  },

  verdict: {
    word: {
      pending: 'A verificar…',
      safe: 'Parece seguro',
      suspicious: 'Suspeito',
      dangerous: 'Perigoso',
      unchecked: 'Nenhum sinal de alerta encontrado',
    },
    line: {
      safe: 'Nenhum sinal de phishing encontrado.',
      suspicious: 'Cuidado: alguns sinais de phishing.',
      dangerous: 'Isto parece phishing.',
      unchecked:
        'Não verificado pela IA. As verificações básicas sozinhas podem falhar uma burla bem feita.',
    },
    advice: {
      safe: 'Mantenha o cuidado com pedidos inesperados: se um e-mail pedir para iniciar sessão ou pagar, abra o site por si em vez de usar as suas ligações.',
      suspicious:
        'Não introduza palavras-passe nem dados do cartão e não pague. Confirme com o remetente por um meio que já conhece.',
      dangerous:
        'Não clique em ligações, não abra anexos nem responda. Apague o e-mail ou denuncie-o como phishing.',
      unchecked:
        'Mantenha o cuidado com pedidos inesperados: se um e-mail pedir para iniciar sessão ou pagar, abra o site por si em vez de usar as suas ligações.',
    },
    aiSaid: { safe: 'nenhum sinal de phishing', suspicious: 'suspeito', dangerous: 'perigoso' },
    sourceDevice: 'Verificado neste dispositivo',
    sourceRulesOnly: 'Só verificações básicas',
    doneIn: (time) => `Feito em ${time}`,
    ownReasons: {
      confirmed: 'O remetente está confirmado: o e-mail vem mesmo do domínio indicado.',
      nothingAsked: 'Sem ligações nem pedidos: não há nada em que cair.',
      nothingFound: 'As verificações básicas não encontraram sinais de alerta.',
    },
  },

  judge: {
    theAi: 'a IA',
    theCloudAi: 'a IA na nuvem',
    said: (ai, level) => `${ai[0]?.toUpperCase() ?? ''}${ai.slice(1)} respondeu: ${level}`,
    lineOnlyNotes: (word) =>
      `${word} (remetente confirmado, as verificações básicas não encontraram nada; notas da IA abaixo)`,
    lineStricter: (word, ai, level) => `${word} (verificações básicas; ${ai} respondeu: ${level})`,
    detailOnlyNotes: (said) =>
      `${said}, mas o remetente está confirmado e as verificações básicas não encontraram nada, por isso os seus pontos são apenas notas.`,
    lineNoLinks: (word) =>
      `${word} (sem ligações, as verificações básicas não encontraram nada; notas da IA abaixo)`,
    detailNoLinks: (said) =>
      `${said}, mas o e-mail não tem ligações e as verificações básicas não encontraram nada, por isso os seus pontos são apenas notas.`,
    aiPoints: (points) => `Os seus pontos: ${points}`,
    detailStricter: (said) =>
      `${said}; as verificações básicas encontraram mais, por isso vale o veredicto delas.`,
  },

  aiCheck: {
    starting: 'A iniciar a verificação da IA…',
    waitingHeaders: 'À espera das verificações do remetente…',
    running: (secondTry) => `Verificação da IA em curso${secondTry ? ' (segunda tentativa)' : ''}…`,
    loading: (secondTry) =>
      `A carregar a IA local${secondTry ? ' (segunda tentativa)' : ''}… O primeiro carregamento após reiniciar o Chrome pode demorar alguns minutos; o resultado aparece aqui sozinho.`,
    waitingPrevious: 'À espera da verificação do e-mail anterior…',
    note: 'IA local (Gemini Nano). A IA pode errar.',
    experimental: 'As respostas neste idioma são experimentais.',
    noModel: 'A IA local não está pronta, por isso só correram as verificações básicas.',
    stopped: 'A verificação da IA foi parada. As verificações básicas continuam a valer.',
    failed: (secondTry, detail) =>
      `A verificação da IA falhou${secondTry ? ' após uma segunda tentativa' : ''} (${detail}). As verificações básicas continuam a valer.`,
    unreadable: (secondTry) =>
      `Não foi possível ler a resposta da IA${secondTry ? ' após uma segunda tentativa' : ''}. As verificações básicas continuam a valer.`,
    unknownError: 'erro desconhecido',
  },

  errors: {
    noAnswerWithin: (seconds) => `sem resposta em ${seconds} s`,
    modelWrote: (count) => `o modelo tinha escrito ${count} caracteres`,
    tooLong: (count) => `a resposta não terminou (mais de ${count} caracteres)`,
    refused: (status) => `a nuvem recusou o pedido (HTTP ${status})`,
    cloudFailed: 'o pedido à nuvem falhou',
    offline: 'sem ligação à nuvem',
    tokenNoAnswer: (name) => `sem resposta do servidor de tokens (${name})`,
    tokenRefused: (status) => `o servidor de tokens recusou (HTTP ${status})`,
    signInFailed: (code) => `falha no início de sessão (${code})`,
  },

  deepCheck: {
    notAvailable: 'Não disponível nesta versão.',
    waitingHeaders: 'À espera das verificações do remetente…',
    recommendedExperimental: (language) =>
      `Recomendado: as respostas da IA local em ${language} são experimentais.`,
    recommendedUnchecked: 'Recomendado: a IA local não verificou este e-mail.',
    chips: {
      names: (count) => plural(count, 'nome', 'nomes'),
      emails: (count) => plural(count, 'endereço de e-mail', 'endereços de e-mail'),
      numbers: (count) => plural(count, 'número', 'números'),
      ibans: (count) => plural(count, 'IBAN', 'IBAN'),
      links: (count) => plural(count, 'caminho de ligação', 'caminhos de ligação'),
      nothing: 'Nenhum dado pessoal encontrado',
      namesKept: 'Nomes mantidos',
    },
    changed: {
      idle: '',
      preparing:
        'O e-mail mudou, por isso a verificação aprofundada foi parada. Não foi enviado nada.',
      preview:
        'O e-mail mudou, por isso os dados preparados foram descartados. Não foi enviado nada.',
      sending:
        'O e-mail mudou durante a verificação aprofundada: os dados dele já tinham sido enviados, a resposta foi descartada.',
      done: 'O e-mail mudou, por isso o resultado da verificação aprofundada foi apagado.',
    },
    waitingModel: 'À espera da IA local…',
    lookingForNames: 'A procurar nomes neste dispositivo…',
    prepareFailed:
      'A verificação aprofundada não conseguiu preparar os dados. Não foi enviado nada.',
    stopped:
      'A verificação aprofundada foi parada. Os dados mostrados podem já ter chegado à nuvem; pode enviá-los de novo.',
    limit:
      'A verificação aprofundada atingiu o limite de hoje. Não foi enviado nada; o resultado acima continua a valer.',
    unreadable:
      'Não foi possível ler a resposta da nuvem. O resultado acima continua a valer; pode enviar os dados de novo.',
    failed:
      'A verificação aprofundada não funcionou. O resultado acima continua a valer; pode enviar os dados de novo.',
    failedDetail: (detail) => `O pedido à nuvem falhou: ${detail}.`,
    resultWord: (word) => `Verificação aprofundada: ${word}`,
    source: 'Verificado na nuvem',
    note: (time) => `Nuvem (Gemini através do Firebase AI Logic). A IA pode errar. ${time}.`,
    sentOnce: 'Enviado uma vez, só para esta verificação.',
    checking: 'A verificar na nuvem…',
    showFailed: 'Não foi possível mostrar o resultado da verificação aprofundada.',
    levelChanged:
      'O novo nível de privacidade aplica-se à próxima verificação aprofundada. Os dados acima foram enviados com o nível anterior.',
    nothingSent: 'Não foi enviado nada.',
    stoppedNothingSent: 'Parado. Não foi enviado nada.',
  },
};
