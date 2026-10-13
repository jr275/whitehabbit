/* ================================================================== *
 * THE DICTIONARY — every string Keeply shows, in both languages.
 *
 * ---- WHY `en` IS THE TYPE AND `ptBR` IS CHECKED AGAINST IT --------
 *
 * `Dictionary` is `typeof en`, and `ptBR` is annotated with it. That is
 * not a stylistic choice: it means a key added to English and forgotten
 * in Portuguese FAILS `pnpm typecheck`, and a key that exists only in
 * Portuguese fails too. A half-translated screen cannot reach a
 * deployment by being overlooked, which is the failure mode every
 * untyped translation file eventually has.
 *
 * English is the source of truth for the KEY SET only. Neither language
 * is a second-class rendering of the other, and neither falls back to
 * the other at runtime — there is nothing to fall back to, because
 * nothing can be missing.
 *
 * ---- PLURALS AND NUMBERS ------------------------------------------
 *
 * Anything that varies with a value is a FUNCTION, not a template with
 * a placeholder. The two languages do not agree on where the number
 * goes, whether the noun inflects, or whether an article appears, and a
 * `{count} items` string forces one language's grammar onto the other.
 * A function lets each language write its own sentence.
 *
 * Numbers are formatted with `toLocaleString(locale)` at the call site,
 * so 1.234 and 1,234 are each right where they are read.
 * ================================================================== */

import type { Locale } from "./locale"

/* No `as const` here, deliberately. It would make every value a literal
 * type, and `ptBR: Dictionary` would then demand the ENGLISH literal
 * for each key — the annotation would reject every translation instead
 * of checking it. Widened inference gives exactly the guarantee that is
 * wanted: the KEY SET and each function's PARAMETERS are fixed, the
 * prose is free. */
export const en = {
  /* ── Shared ──────────────────────────────────────────────────── */
  common: {
    skipToContent: "Skip to content",
    search: "Search",
    save: "Save",
    saveALink: "Save a link",
    cancel: "Cancel",
    close: "Close",
    tryAgain: "Try again",
    signIn: "Sign in",
    loading: "Loading…",
    language: "Language",
    light: "Light",
    dark: "Dark",
    switchToLight: "Switch to the light surface",
    switchToDark: "Switch to the dark surface",
    keeplyHome: "Keeply home",
  },

  /* ── Navigation ──────────────────────────────────────────────── */
  nav: {
    browse: "Browse",
    knowledgeNavigation: "Knowledge navigation",
    home: "Home",
    library: "Library",
    topics: "Topics",
    connections: "Connections",
    favorites: "Favorites",
    settings: "Settings",
    ask: "Ask",
    askYourKnowledge: "Ask your knowledge",
    searchYourKnowledge: "Search your knowledge",
  },

  /* ── Kinds of saved thing ────────────────────────────────────── */
  kinds: {
    article: "Article",
    video: "Video",
    pdf: "PDF",
    podcast: "Podcast",
    social: "Post",
    document: "Note",
  },

  /* ── A saved item, as a row ──────────────────────────────────── */
  item: {
    reading: "Reading…",
    couldNotFetch: "Couldn’t fetch",
    retry: "Retry",
    addToFavorites: "Add to favorites",
    removeFromFavorites: "Remove from favorites",
  },

  /* ── Relative time and reading length ────────────────────────── */
  time: {
    savedToday: "Saved today",
    savedYesterday: "Saved yesterday",
    /** `ago` arrives already formatted by Intl.RelativeTimeFormat. */
    savedAgo: (ago: string): string => `Saved ${ago}`,
    minutes: (min: number): string => `${min} min`,
    minutesRead: (min: number): string => `${min} min read`,
  },

  /* ── Reader ──────────────────────────────────────────────────── */
  reader: {
    askAboutThis: "Ask about this",
    addFavorite: "Add favorite",
    removeFavorite: "Remove favorite",
    openOriginal: "Open original in a new tab",

    insights: "Insights",
    topics: "Topics",

    source: "Source",
    author: "Author",
    origin: "Origin",
    type: "Type",
    words: "Words",
    saved: "Saved",
    published: "Published",

    aiSummary: "AI summary",
    summarize: "Summarize",
    summarizing: "Summarizing…",
    summarizeTitle: "Summarize this article with AI",

    listen: "Listen to this article",
    pauseReading: "Pause reading",
    resumeReading: "Resume reading",
    stopReading: "Stop reading",
    previousParagraph: "Previous paragraph",
    nextParagraph: "Next paragraph",
    playbackSpeed: "Playback speed",

    isPdf: "This is a PDF document.",
    stillFetching: "We’re still fetching and extracting this.",
    stillFetchingHint: "This page will fill in with the full text once it’s ready.",
    extractFailed: "We couldn’t extract this page.",
    extractFailedHint: "The source may block automated reading. You can still open it at the source.",
    noReadableText: "There’s no readable text for this one.",
  },

  /* ── Ask ─────────────────────────────────────────────────────── */
  ask: {
    eyebrow: "Ask",
    title: "Ask your knowledge.",
    lede: "Answers are built only from what you’ve saved, and every claim carries the passage it came from.",
    placeholder: "What do I know about…?",
    fieldLabel: "Ask your knowledge",
    sendHint: "Enter to send · Shift+Enter for a new line",
    stopHint: "Esc to stop",
    sendLabel: "Ask",
    stopLabel: "Stop",
    recent: "Recent",
    nothingSaved: "Nothing saved yet.",
    scope: (count: number, formatted: string): string =>
      count === 1 ? "Answered from the 1 item you’ve saved." : `Answered from all ${formatted} items you’ve saved.`,

    exchangeLabel: "Your question and its answer",
    youAsked: "You asked",

    answer: "Answer",
    evidence: "Evidence",
    sources: "Sources",
    consultedNotCited: "Consulted, not cited",
    provenance: "How this answer was produced",
    retrieved: (bits: string): string => `Retrieved ${bits}`,
    passages: (count: number): string => (count === 1 ? "1 passage" : `${count} passages`),
    droppedForLength: (count: number): string => `${count} left out for length`,
    unknownCitation: "This reference doesn’t match any source that was retrieved.",

    ungrounded: (ids: string): string =>
      `This answer refers to sources that were not retrieved (${ids}). Treat it as unverified — those references point to nothing in your library.`,
    ungroundedOne: (id: string): string =>
      `This answer refers to a source that was not retrieved (${id}). Treat it as unverified — that reference points to nothing in your library.`,

    emptyTitle: "Nothing to ask yet.",
    emptyBody: "Ask answers only from what you’ve saved. Save a few pieces and this becomes useful.",
    idle: "Your answer, the passages behind it and the pieces they came from will appear here.",

    insufficientTitle: "Not enough to answer this.",
    insufficientBody: (retrieved: number): string =>
      retrieved === 1
        ? "Your library has a passage near this topic, but it isn’t close enough to answer from. Rather than guess, nothing was generated."
        : "Your library has passages near this topic, but none is close enough to answer from. Rather than guess, nothing was generated.",
    browseInstead: "Browse your library instead",

    noResultsTitle: "Nothing in your library covers this.",

    semanticNotConfigured:
      "Meaning-based search is not configured on this deployment, so this searched exact words only. Questions phrased differently from your saved text may find nothing.",
    semanticUnavailable:
      "Meaning-based search is temporarily unavailable, so this searched exact words only. Try again later for a fuller answer.",

    copyCode: "Copy code",
    copy: "Copy",
    copied: "Copied",
    code: "code",
  },

  /* ── Failures, by the server's own taxonomy ──────────────────── */
  askFailure: {
    unauthorized: "Sign in to ask.",
    invalid_request: "That question can’t be asked.",
    rate_limited: "Too many questions just now.",
    provider_unavailable: "Ask isn’t configured.",
    provider_error: "Couldn’t reach the model.",
    malformed_response: "Unreadable response.",
    network: "You appear to be offline.",
    unknown: "Something went wrong.",
  },

  /* ── The run, while it happens ───────────────────────────────── */
  run: {
    working: "Working",
    done: "Done",
    stopped: "Stopped",
    interrupted: "Interrupted",
    finished: "Finished.",
    workingEllipsis: "Working…",
    stoppedWith: (message: string): string => `Stopped. ${message}`,
    connectionEnded: "The connection ended before the answer finished.",
    truncated:
      "The connection ended before the answer finished. Nothing was reported as failing — asking again will start a fresh run.",

    steps: {
      retrieval: "Searching your library",
      evidence: "Weighing the evidence",
      generation: "Writing the answer",
      verification: "Checking every citation",
    },

    status: {
      waiting: "waiting",
      notReached: "not reached",
      notNeeded: "not needed",
      inProgress: "in progress",
      done: "done",
      failed: "failed",
    },

    candidates: (count: number, mode: string): string =>
      count === 1 ? `1 candidate · ${mode} search` : `${count} candidates · ${mode} search`,
    noEmbeddings: (base: string): string => `${base} (no embeddings configured)`,
    passagesUsed: (count: number): string => (count === 1 ? "1 passage used" : `${count} passages used`),
    rejected: (count: number): string => `${count} rejected`,
    refusedWithRejects: (count: number): string =>
      count === 1
        ? "nothing supported a claim — 1 passage was close but not evidence"
        : `nothing supported a claim — ${count} passages were close but not evidence`,
    refusedEmpty: "nothing in your library covers this",
    generationSkipped: "skipped — no model was asked",
    usage: (model: string, input: number, output: number): string => `${model} · ${input} in, ${output} out`,
    citationsChecked: (count: number): string => (count === 1 ? "1 citation checked" : `${count} citations checked`),
    unresolved: (count: number): string => `${count} did not resolve`,
  },
}

export type Dictionary = typeof en

/* ------------------------------------------------------------------ *
 * PORTUGUÊS DO BRASIL
 *
 * Written as Brazilian Portuguese, not as English with Portuguese
 * words: "Pesquisar" rather than "Buscar" for the field that opens the
 * palette, "Perguntar" for the verb the product is built on, and the
 * sentences carry the same plain, direct register the English does.
 * ------------------------------------------------------------------ */

export const ptBR: Dictionary = {
  common: {
    skipToContent: "Pular para o conteúdo",
    search: "Pesquisar",
    save: "Salvar",
    saveALink: "Salvar um link",
    cancel: "Cancelar",
    close: "Fechar",
    tryAgain: "Tentar de novo",
    signIn: "Entrar",
    loading: "Carregando…",
    language: "Idioma",
    light: "Claro",
    dark: "Escuro",
    switchToLight: "Mudar para o tema claro",
    switchToDark: "Mudar para o tema escuro",
    keeplyHome: "Início do Keeply",
  },

  nav: {
    browse: "Navegar",
    knowledgeNavigation: "Navegação do Keeply",
    home: "Início",
    library: "Biblioteca",
    topics: "Temas",
    connections: "Conexões",
    favorites: "Favoritos",
    settings: "Configurações",
    ask: "Perguntar",
    askYourKnowledge: "Pergunte ao seu conhecimento",
    searchYourKnowledge: "Pesquisar no seu conhecimento",
  },

  kinds: {
    article: "Artigo",
    video: "Vídeo",
    pdf: "PDF",
    podcast: "Podcast",
    social: "Publicação",
    document: "Nota",
  },

  item: {
    reading: "Lendo…",
    couldNotFetch: "Não foi possível buscar",
    retry: "Tentar de novo",
    addToFavorites: "Adicionar aos favoritos",
    removeFromFavorites: "Remover dos favoritos",
  },

  time: {
    savedToday: "Salvo hoje",
    savedYesterday: "Salvo ontem",
    savedAgo: (ago: string) => `Salvo ${ago}`,
    minutes: (min: number) => `${min} min`,
    minutesRead: (min: number) => `${min} min de leitura`,
  },

  reader: {
    askAboutThis: "Perguntar sobre isto",
    addFavorite: "Adicionar aos favoritos",
    removeFavorite: "Remover dos favoritos",
    openOriginal: "Abrir o original em uma nova aba",

    insights: "Percepções",
    topics: "Temas",

    source: "Fonte",
    author: "Autor",
    origin: "Origem",
    type: "Tipo",
    words: "Palavras",
    saved: "Salvo",
    published: "Publicado",

    aiSummary: "Resumo por IA",
    summarize: "Resumir",
    summarizing: "Resumindo…",
    summarizeTitle: "Resumir este artigo com IA",

    listen: "Ouvir este artigo",
    pauseReading: "Pausar a leitura",
    resumeReading: "Retomar a leitura",
    stopReading: "Parar a leitura",
    previousParagraph: "Parágrafo anterior",
    nextParagraph: "Próximo parágrafo",
    playbackSpeed: "Velocidade da leitura",

    isPdf: "Este é um documento PDF.",
    stillFetching: "Ainda estamos buscando e extraindo este conteúdo.",
    stillFetchingHint: "Esta página vai se preencher com o texto completo assim que ele estiver pronto.",
    extractFailed: "Não foi possível extrair esta página.",
    extractFailedHint: "A fonte pode bloquear leitura automatizada. Você ainda pode abri-la no site de origem.",
    noReadableText: "Não há texto legível neste item.",
  },

  ask: {
    eyebrow: "Perguntar",
    title: "Pergunte ao seu conhecimento.",
    lede: "As respostas são construídas apenas a partir do que você salvou, e cada afirmação carrega o trecho de onde veio.",
    placeholder: "O que eu sei sobre…?",
    fieldLabel: "Pergunte ao seu conhecimento",
    sendHint: "Enter para enviar · Shift+Enter para quebrar a linha",
    stopHint: "Esc para parar",
    sendLabel: "Perguntar",
    stopLabel: "Parar",
    recent: "Recentes",
    nothingSaved: "Nada salvo ainda.",
    scope: (count: number, formatted: string) =>
      count === 1
        ? "Respondido a partir do 1 item que você salvou."
        : `Respondido a partir dos ${formatted} itens que você salvou.`,

    exchangeLabel: "Sua pergunta e a resposta",
    youAsked: "Você perguntou",

    answer: "Resposta",
    evidence: "Evidências",
    sources: "Fontes",
    consultedNotCited: "Consultadas, não citadas",
    provenance: "Como esta resposta foi produzida",
    retrieved: (bits: string) => `Recuperado: ${bits}`,
    passages: (count: number) => (count === 1 ? "1 trecho" : `${count} trechos`),
    droppedForLength: (count: number) => `${count} deixados de fora por tamanho`,
    unknownCitation: "Esta referência não corresponde a nenhuma fonte recuperada.",

    ungrounded: (ids: string) =>
      `Esta resposta cita fontes que não foram recuperadas (${ids}). Trate-a como não verificada — essas referências não apontam para nada na sua biblioteca.`,
    ungroundedOne: (id: string) =>
      `Esta resposta cita uma fonte que não foi recuperada (${id}). Trate-a como não verificada — essa referência não aponta para nada na sua biblioteca.`,

    emptyTitle: "Ainda não há o que perguntar.",
    emptyBody:
      "O Perguntar responde apenas a partir do que você salvou. Salve algumas coisas e isto passa a ser útil.",
    idle: "Sua resposta, os trechos por trás dela e as peças de onde vieram vão aparecer aqui.",

    insufficientTitle: "Não há o suficiente para responder isto.",
    insufficientBody: (retrieved: number) =>
      retrieved === 1
        ? "Sua biblioteca tem um trecho próximo do tema, mas ele não chega perto o bastante para servir de base. Em vez de chutar, nada foi gerado."
        : "Sua biblioteca tem trechos próximos do tema, mas nenhum chega perto o bastante para servir de base. Em vez de chutar, nada foi gerado.",
    browseInstead: "Ver sua biblioteca",

    noResultsTitle: "Nada na sua biblioteca cobre isto.",

    semanticNotConfigured:
      "A busca por significado não está configurada neste ambiente, então isto pesquisou apenas palavras exatas. Perguntas escritas de forma diferente do seu texto salvo podem não encontrar nada.",
    semanticUnavailable:
      "A busca por significado está temporariamente indisponível, então isto pesquisou apenas palavras exatas. Tente de novo mais tarde para uma resposta mais completa.",

    copyCode: "Copiar código",
    copy: "Copiar",
    copied: "Copiado",
    code: "código",
  },

  askFailure: {
    unauthorized: "Entre para perguntar.",
    invalid_request: "Esta pergunta não pode ser feita.",
    rate_limited: "Muitas perguntas agora há pouco.",
    provider_unavailable: "O Perguntar não está configurado.",
    provider_error: "Não foi possível alcançar o modelo.",
    malformed_response: "Resposta ilegível.",
    network: "Você parece estar sem conexão.",
    unknown: "Algo deu errado.",
  },

  run: {
    working: "Trabalhando",
    done: "Concluído",
    stopped: "Parado",
    interrupted: "Interrompido",
    finished: "Concluído.",
    workingEllipsis: "Trabalhando…",
    stoppedWith: (message: string) => `Parado. ${message}`,
    connectionEnded: "A conexão terminou antes de a resposta acabar.",
    truncated:
      "A conexão terminou antes de a resposta acabar. Nada foi reportado como falha — perguntar de novo inicia uma execução nova.",

    steps: {
      retrieval: "Pesquisando sua biblioteca",
      evidence: "Pesando as evidências",
      generation: "Escrevendo a resposta",
      verification: "Conferindo cada citação",
    },

    status: {
      waiting: "aguardando",
      notReached: "não alcançado",
      notNeeded: "não necessário",
      inProgress: "em andamento",
      done: "concluído",
      failed: "falhou",
    },

    candidates: (count: number, mode: string) =>
      count === 1 ? `1 candidato · busca ${mode}` : `${count} candidatos · busca ${mode}`,
    noEmbeddings: (base: string) => `${base} (sem embeddings configurados)`,
    passagesUsed: (count: number) => (count === 1 ? "1 trecho usado" : `${count} trechos usados`),
    rejected: (count: number) => `${count} rejeitados`,
    refusedWithRejects: (count: number) =>
      count === 1
        ? "nada sustentou uma afirmação — 1 trecho chegou perto, mas não era evidência"
        : `nada sustentou uma afirmação — ${count} trechos chegaram perto, mas não eram evidência`,
    refusedEmpty: "nada na sua biblioteca cobre isto",
    generationSkipped: "pulado — nenhum modelo foi consultado",
    usage: (model: string, input: number, output: number) => `${model} · ${input} entrada, ${output} saída`,
    citationsChecked: (count: number) => (count === 1 ? "1 citação conferida" : `${count} citações conferidas`),
    unresolved: (count: number) => `${count} não resolveram`,
  },
}

export const DICTIONARIES: Record<Locale, Dictionary> = {
  en,
  "pt-BR": ptBR,
}

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale]
}
