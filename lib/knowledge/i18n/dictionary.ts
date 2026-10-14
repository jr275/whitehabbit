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

  meta: {
    /* The browser tab, a bookmark and a shared link. Read as often as
     * anything on the page, so they are translated like anything else.
     * The pages that carry them already resolve the locale, so nothing
     * becomes dynamic that was not already. */
    appTitle: "Keeply",
    appDescription:
      "Your personal knowledge library. Save anything worth remembering and let Keeply understand, organize and connect it for you.",
    connectionsTitle: "Keeply",
    connectionsDescription:
      "An interactive view of what your saved library actually contains — themes, concepts, connections and the questions they raise.",
    homeTitle: "Home · Keeply",
    homeDescription: "Your personal knowledge library — pick up where you left off, or save something new.",
    askTitle: "Ask · Keeply",
    askDescription: "Ask your own library and surface the connections in what you save.",
    listenTitle: "Listen · Keeply",
    listenDescription: "Listen to your saves like a podcast.",
    researchTitle: "Research · Keeply",
    researchDescription: "Give Keeply an objective and get an evidence-grounded brief from your own sources.",
    settingsTitle: "Settings · Keeply",
    settingsDescription: "Manage your Keeply account and preferences.",
    topicsTitle: "Topics · Keeply",
    libraryTitle: "Library · Keeply",
    favoritesTitle: "Favorites · Keeply",
    collectionsTitle: "Collections · Keeply",
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

  /* ── Pages that are not built yet ────────────────────────────── */
  comingSoon: {
    collectionsEyebrow: "Collections",
    collectionsTitle: "How you choose to organize.",
    collectionsBody:
      "Topics surface automatically from what you save — Collections are the sets you build on purpose, around a project, question or theme.",
    collectionsBullets: [
      "Create collections and drag saved items into them",
      "Keep them separate from the topics Keeply detects for you",
      "Share a collection as a read-only reading list",
    ],
    audioEyebrow: "Audio",
    audioTitle: "Listen to your saves like a podcast.",
    audioBody: "Turn saved articles into narrated audio and play them as a queue.",
    audioBullets: [
      "Text-to-speech narration of extracted article text",
      "A continuous listening queue built from your unread saves",
      "Playback speed and resume-where-you-left-off",
    ],
    badge: "Coming soon",
    backToLibrary: "Back to your library",
    honestBody:
      "This surface is designed but not wired to a real service yet, so there’s nothing to show — we’d rather leave it honest than fill it with fake data.",
  },

  /* ── Favorites ───────────────────────────────────────────────── */
  favorites: {
    eyebrow: "Favorites",
    title: "The ones you keep coming back to.",
    subtitle: "Everything you’ve marked worth remembering twice.",
  },

  /* ── Research ────────────────────────────────────────────────── */
  research: {
    eyebrow: "Deep work",
    title: "What do you want to research?",
    subtitle:
      "Give Keeply an objective and it will search everything you’ve saved, understand the sources and build an evidence-grounded brief.",
    objectiveLabel: "Research objective",
    submit: "Research",
    loading: "Researching your objective…",
    loadingBody: "Searching relevant sources and synthesizing the evidence.",
    nothingCovers: "Nothing in your library covers this yet.",
    browseLibrary: "Browse your library",
    answerHeading: "Research answer",
    keyDiscoveries: "Key discoveries",
    pieces: (count: number, formatted: string): string =>
      count === 1 ? "1 saved piece" : `${formatted} saved pieces`,
    lexicalOnlyUnconfigured:
      "Meaning-based search is not configured on this deployment, so this searched exact words only. Sources phrased differently from your objective may have been missed.",
    lexicalOnlyUnavailable:
      "Meaning-based search is temporarily unavailable, so this searched exact words only. Try again later for fuller coverage.",
    placeholder: "I want to understand how companies use AI for payment reconciliation.",
    failure: {
      unauthorized: "Sign in to research.",
      invalid_request: "That objective can’t be researched.",
      rate_limited: "Too many research runs just now.",
      provider_unavailable: "Research isn’t configured.",
      provider_error: "Couldn’t reach the model.",
      malformed_response: "Unreadable response.",
      network: "You appear to be offline.",
      unknown: "Something went wrong.",
    },
  },

  /* ── Understand: connections and the explorer ────────────────── */
  understand: {
    connectionsEyebrow: "How it connects",
    connectionsTitle: "The ideas that keep showing up together",
    connectionsLede:
      "Every line here is a count, not a guess: two concepts are connected when the same saved items discuss both. Select one to see what joins it, and to which pieces.",
    explorerEyebrow: "Find it",
    explorerTitle: "Everything, plainly",
    explorerLede: "The part where you look something up.",
    sectionsOfThisPage: "Sections of this page",
    concepts: "Concepts",
    relatedTo: "Related to",
    nothingWithFilters: "Nothing to show with these filters.",
    introEmpty: "Save something and Keeply will start finding what it is about.",
    introPending: "Keeply hasn’t finished reading it yet — concepts will appear here as it does.",
    yourKnowledgeEyebrow: "Your knowledge",
    moreThanANumber: "But your library is more interesting than a number.",
    explore: "Explore your knowledge",
    whatsInThere: "What’s actually in there",
    whatKeeplyFound: "What Keeply found in your library",
    demoNotice:
      "These figures are a fixed sample library, not your account — this page shows how Keeply would present a real one.",
    noConnectionsYet:
      "Connections appear once Keeply has read enough of your library to find ideas that turn up in more than one piece.",
    concepts_n: (count: number, formatted: string): string =>
      count === 1 ? "1 concept" : `${formatted} concepts`,
    themes_n: (count: number, formatted: string): string => (count === 1 ? "1 theme" : `${formatted} themes`),
    questions_n: (count: number, formatted: string): string =>
      count === 1 ? "1 question" : `${formatted} questions`,
    /* The chapter rail's own names. Carried as a block so the rail can
     * hold KEYS — a module-level `label: "Signals"` was the one English
     * word left in a Portuguese page, because a const outside a
     * component has no hook to read the dictionary with. */
    chapters: {
      signals: "Signals",
      connections: "Connections",
      explorer: "Explorer",
    },
    /* Split around the number so each language keeps its own word
     * order, and the component can still colour the figure. */
    savedThings: (formatted: string): string => `You saved ${formatted} things.`,
    signals: {
      thingsSaved: "things saved",
      thingsSavedNote: "articles, videos, PDFs and your own notes",
      concepts: "concepts",
      conceptsNote: "distinct ideas Keeply named across your sources",
      themes: "themes",
      themesNote: "concepts that cluster into a subject you follow",
      openQuestions: "open questions",
      openQuestionsNote: "raised repeatedly, resolved nowhere",
    },
    keeplyFound: "Keeply found",
    collectingSince: "Collecting since",
    footerLive: "Everything on this page is read from your library.",
    footerSample: "Signed out, so this shows a fixed sample library rather than an account. Sign in to see your own.",
    noConnectionForIdea:
      "Nothing else you’ve saved carries this idea alongside another one yet. A connection needs one piece that is about both.",
  },

  /* ── The detail drawer ───────────────────────────────────────── */
  explorer: {
    closeDetail: "Close detail",
    savedItem: "Saved item",
    whatKeeplyUnderstood: "What Keeply understood",
    inShort: "In short",
    whyItMatters: "Why it matters",
    thePieceItself: "The piece itself",
    connectedKnowledge: "Connected knowledge",
    loadFailed: "Your library could not be loaded just now. Nothing has been lost — reload to try again.",
    nothingSaved: "Nothing saved yet. Save a link and it will appear here.",
    filterByType: "Filter by type",
    filterByConcept: "Filter by concept",
    searchYourLibrary: "Search your library",
    sortBy: "Sort by",
    notReadYet: "Keeply hasn’t read these yet. The ideas it finds will appear here as it does.",
    noConceptsInSample: "No concepts in this sample.",
    ideasInYourLibrary: "Ideas in your library",
    askAboutConcept: "Ask about this concept",
    askAboutThis: "Ask about this",
    whatDidILearn: (title: string): string => `What did I learn from “${title}”?`,
    sorts: {
      recent: "Recent",
      relevant: "Relevant",
      revisited: "Most revisited",
    },
    readItInKeeply: "Read it in Keeply",
    openTheOriginal: "Open the original",
    exploreConnections: "Explore connections",
    revisitedTimes: (count: number): string => `revisited ${count}×`,
    shown: (visible: number, of: number): string => `${visible} of ${of} shown`,
    filteredBy: (concept: string): string => `filtered by ${concept}`,
    showingMostRecent: (shown: number, total: string): string =>
      `showing the ${shown} most recent of ${total} saved`,
    nothingBoth: (concept: string, kind: string): string => `Nothing here is both ${concept} and ${kind}.`,
  },

  voiceSearch: {
    unsupported: "Voice search isn’t supported in this browser",
    requesting: "Requesting microphone permission…",
    listening: "Listening — tap to stop",
    processing: "Processing voice input",
    denied: "Microphone permission denied — tap to try again",
    error: "Voice search error — tap to try again",
    idle: "Search by voice",
  },

  /* ── Settings ────────────────────────────────────────────────── */
  settings: {
    eyebrow: "Settings",
    title: "Your account",
    subtitle: "Manage how Keeply works for you.",
    signedInAs: "Signed in as",
    notSignedIn: "Not signed in — your library is saved on this device",
    signedIn: "Signed in",
    signInPermanently: "Sign in to save permanently",
    signOut: "Sign out",
    notBuiltYet: "Not built yet",
    profile: "Profile",
    profileBody: "Your display name, avatar and reading preferences.",
    appearance: "Appearance",
    appearanceBody: "Reading themes, typography and layout density.",
    privacy: "Privacy",
    privacyBody: "Control what Keeply remembers and how it is used.",
    yourData: "Your data",
    yourDataBody: "Export or permanently delete everything you’ve saved.",
  },

  /* ── What Keeply has read ────────────────────────────────────── */
  indexing: {
    heading: "What Keeply has read",
    deploymentUnfinished: "This deployment isn’t finished",
    deploymentHint: "Set these on the server and redeploy. This page is how you confirm it worked.",
    read: "Read",
    waiting: "Waiting",
    inTheQueue: "In the queue",
    failed: "Failed",
    neverRead: "Never read",
    textChanged: "Text changed since",
    noIdeas: "No ideas extracted yet",
    noSummary: "No summary yet",
    missingEmbeddings: "Missing embeddings",
    queueing: "Queueing…",
    nothingWaiting: "Nothing waiting",
    readWhatsWaiting: "Read what’s waiting",
    queued: (count: number): string => (count === 1 ? "Queued 1 piece." : `Queued ${count} pieces.`),
    alreadyQueued: (count: number): string => `Already queued — ${count} waiting.`,
    nothingToQueue: "Nothing to queue: everything has been read.",
    queueFailed: "Couldn’t queue the work.",
    readFailed: "Couldn’t read what Keeply has processed.",
    notConfigured: "not configured",
    configured: "configured",
  },

  /* ── Discovery, in the Reader ────────────────────────────────── */
  discovery: {
    keyIdeas: "Key ideas",
    relatedKnowledge: "Related knowledge",
    loadFailed: "Couldn’t load what we know about this piece.",
    guestNotAnalyzed: "Saves kept only in this browser aren’t analyzed. Sign in to have Keeply read them.",
    pending: "Key ideas will appear here after Keeply reads this one.",
    nothingRelated: "Nothing else you’ve saved shares these ideas yet.",
    organizations: "Organizations",
    technologies: "Technologies & products",
    alsoMentioned: "Also mentioned",
    reading: "Reading what this is about…",
    passagesInPiece: (count: number): string =>
      count === 1
        ? "1 passage in this piece — see everything about it"
        : `${count} passages in this piece — see everything about it`,
    groups: {
      keyIdeas: "Key ideas",
      people: "People",
      organizations: "Organizations",
      technologies: "Technologies & products",
      alsoMentioned: "Also mentioned",
    },
  },

  guestImport: {
    pendingTitle: (count: number): string =>
      count === 1 ? "1 link is saved on this device only" : `${count} links are saved on this device only`,
    pendingBody: "They were saved before you signed in. Move them into your account to keep them across devices.",
    notNow: "Not now",
    moveToAccount: "Move to my account",
    moved: (count: number): string =>
      count === 1 ? "1 link moved to your account" : `${count} links moved to your account`,
    stayed: (count: number): string =>
      count === 1 ? "1 link stayed on this device:" : `${count} links stayed on this device:`,
  },

  /* ── Library ─────────────────────────────────────────────────── */
  library: {
    title: "Library",
    subtitle: "Everything you’ve saved.",
    searchPlaceholder: "Search your knowledge",
    clearSearch: "Clear search",
    all: "All",
    filters: {
      article: "Articles",
      video: "Videos",
      pdf: "PDFs",
      podcast: "Podcasts",
      document: "Notes",
      social: "Posts",
    },
    results: (count: number, query: string): string =>
      count === 1 ? `1 result · ${query}` : `${count} results · ${query}`,
    searchFailedTitle: "That search didn’t complete.",
    serverProblem: "Something went wrong on our end.",
    noMatchTitle: (query: string): string => `Nothing matches “${query}”.`,
    noMatchBody: "Try a different word, or check the spelling.",
    loadFailedTitle: "We couldn’t load your library.",
    loadMore: "Load more",
    savedCount: (formatted: string): string => `${formatted} saved`,
    matchedPassage: "Matched passage",
  },

  /* ── Home ────────────────────────────────────────────────────── */
  home: {
    goodMorning: "Good morning",
    goodAfternoon: "Good afternoon",
    goodEvening: "Good evening",
    welcomeBack: "Welcome back",
    yourKnowledge: "Your knowledge.",
    searchEverything: "Search everything you saved",
    askYourKnowledge: "Ask your knowledge",
    saveSomethingNew: "Save something new",
    recentlySaved: "Recently saved",
    browseLibrary: "Browse library",
    allTopics: "All topics",
    topicsPending: "Topics will appear here as Keeply reads what you save.",
    discover: "Discover",
    openConnections: "Open connections",
    discoverBody:
      "The links between what you’ve saved — concepts that keep turning up together, and the pieces they turn up in.",
    saved: (formatted: string): string => `${formatted} saved`,
    unread: (formatted: string): string => `${formatted} unread`,
    favourites: (count: number, formatted: string): string =>
      count === 1 ? "1 favourite" : `${formatted} favourites`,
  },

  /* ── Topics ──────────────────────────────────────────────────── */
  topicsPage: {
    eyebrow: "Topics",
    title: "The themes running through your library.",
    subtitle: "Topics surface automatically from what you save. Larger means stronger presence.",
    emptyBody: "Save a few things and topics will start to appear here.",
    emptyTitle: "No topics yet.",
    surfaced: (count: number, formatted: string): string =>
      count === 1
        ? "Surfaced automatically from what you save · 1 topic"
        : `Surfaced automatically from what you save · ${formatted} topics`,
    askAboutThis: "Ask about this →",
    pieces: (count: number, formatted: string): string => (count === 1 ? "1 piece" : `${formatted} pieces`),
    askQuestion: (topic: string): string => `What have I saved about ${topic}?`,
    askAboutTopic: "Ask about this topic",
  },

  /* ── Command palette ─────────────────────────────────────────── */
  palette: {
    label: "Command palette and library search",
    closeLabel: "Close command palette",
    placeholder: "Search your library or type a command…",
    listening: "Listening…",
    processing: "Processing…",
    actions: "Actions",
    navigate: "Navigate",
    commands: "Commands",
    quickActions: "Quick actions",
    inYourLibrary: "In your library",
    noCommands: "No commands found.",
    noMatches: (query: string): string => `No saved items match “${query}”.`,
    searchScope: "Search looks through titles, sources, tags and the extracted text of what you’ve saved.",
    cmd: {
      save: "Save a URL",
      saveHint: "Add a link to your library",
      library: "Go to Library",
      libraryHint: "All your saved knowledge",
      favorites: "Go to Favorites",
      favoritesHint: "The ones you starred",
      topics: "Go to Topics",
      topicsHint: "Themes across your library",
      ask: "Go to Ask",
      askHint: "Ask your knowledge",
      home: "Go to Home",
      homeHint: "Your library overview",
    },
  },

  /* ── Saving ──────────────────────────────────────────────────── */
  saveDialog: {
    dialogLabel: "Save to your library",
    heading: "Save to library",
    field: "Paste anything worth remembering",
    hint: "We’ll fetch the page and pull out its title, author and readable text.",
    saving: "Saving to your library…",
    saved: "Saved",
    savedHint: "Fetching the page and extracting its content now — your card will update as it progresses.",
    duplicate: "Already in your library",
    open: "Open",
    genericError: "Something went wrong. Please try again.",
  },

  /* ── An empty library ────────────────────────────────────────── */
  empty: {
    title: "Your library starts here.",
    body: "Save something from the web and it will appear here — readable, searchable, and connected to everything else you keep.",
    pieceNotHere: "This piece isn’t here.",
    mayHaveBeenRemoved: "It may have been removed from your library.",
    backToLibrary: "Back to your library",
    noTopicsYet: "No topics yet.",
  },

  /* ── Account ─────────────────────────────────────────────────── */
  account: {
    guest: "Guest",
    yourAccount: "Your account",
    savedOnThisDevice: "Saved on this device",
    notNow: "Not now",
    createAnAccount: "Create an account",
    signOutAction: "Sign out",
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
    askMainIdeas: (title: string): string => `What are the main ideas in "${title}"?`,
    openTheOriginal: "Open the original",
    summaryFailed: "Couldn’t generate a summary. Try again.",
    leadImage: (title: string): string => `Lead image for ${title}`,
    partialSummary: "This is the summary we could pull from the source. Open the original to read the full piece.",
    pdfOpensBest: "PDFs open best in their own viewer. Open it in a new tab to read, search and download.",
    noArticleText: "We saved the link, but this page didn’t expose article text we could pull in.",
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

  meta: {
    appTitle: "Keeply",
    appDescription:
      "Sua biblioteca pessoal de conhecimento. Salve tudo o que vale a pena lembrar e deixe o Keeply entender, organizar e conectar por você.",
    connectionsTitle: "Keeply",
    connectionsDescription:
      "Uma visão interativa do que a sua biblioteca realmente contém — assuntos, conceitos, conexões e as perguntas que eles levantam.",
    homeTitle: "Início · Keeply",
    homeDescription: "Sua biblioteca pessoal de conhecimento — retome de onde parou, ou salve algo novo.",
    askTitle: "Perguntar · Keeply",
    askDescription: "Pergunte à sua própria biblioteca e revele as conexões no que você salva.",
    listenTitle: "Ouvir · Keeply",
    listenDescription: "Ouça o que você salvou como um podcast.",
    researchTitle: "Pesquisa · Keeply",
    researchDescription: "Dê um objetivo ao Keeply e receba um relatório fundamentado nas suas próprias fontes.",
    settingsTitle: "Configurações · Keeply",
    settingsDescription: "Gerencie sua conta e preferências do Keeply.",
    topicsTitle: "Temas · Keeply",
    libraryTitle: "Biblioteca · Keeply",
    favoritesTitle: "Favoritos · Keeply",
    collectionsTitle: "Coleções · Keeply",
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

  comingSoon: {
    collectionsEyebrow: "Coleções",
    collectionsTitle: "Como você escolhe organizar.",
    collectionsBody:
      "Os temas surgem sozinhos do que você salva — as Coleções são os conjuntos que você monta de propósito, em torno de um projeto, de uma pergunta ou de um assunto.",
    collectionsBullets: [
      "Criar coleções e arrastar itens salvos para dentro delas",
      "Mantê-las separadas dos temas que o Keeply detecta sozinho",
      "Compartilhar uma coleção como lista de leitura somente leitura",
    ],
    audioEyebrow: "Áudio",
    audioTitle: "Ouça o que você salvou como um podcast.",
    audioBody: "Transforme artigos salvos em áudio narrado e ouça em sequência.",
    audioBullets: [
      "Narração por síntese de voz do texto extraído do artigo",
      "Uma fila contínua de escuta montada com o que você ainda não leu",
      "Velocidade de reprodução e retomada de onde você parou",
    ],
    badge: "Em breve",
    backToLibrary: "Voltar para sua biblioteca",
    honestBody:
      "Esta tela está desenhada, mas ainda não ligada a um serviço real, então não há nada para mostrar — preferimos deixá-la honesta a enchê-la de dados falsos.",
  },

  favorites: {
    eyebrow: "Favoritos",
    title: "Aqueles aos quais você sempre volta.",
    subtitle: "Tudo o que você marcou como digno de lembrar duas vezes.",
  },

  research: {
    eyebrow: "Trabalho profundo",
    title: "O que você quer pesquisar?",
    subtitle:
      "Dê um objetivo ao Keeply e ele vai pesquisar tudo o que você salvou, entender as fontes e montar um resumo fundamentado em evidências.",
    objectiveLabel: "Objetivo da pesquisa",
    submit: "Pesquisar",
    loading: "Pesquisando seu objetivo…",
    loadingBody: "Procurando fontes relevantes e sintetizando as evidências.",
    nothingCovers: "Nada na sua biblioteca cobre isso ainda.",
    browseLibrary: "Explorar sua biblioteca",
    answerHeading: "Resposta da pesquisa",
    keyDiscoveries: "Principais descobertas",
    pieces: (count: number, formatted: string): string =>
      count === 1 ? "1 peça salva" : `${formatted} peças salvas`,
    lexicalOnlyUnconfigured:
      "A busca por significado não está configurada neste ambiente, então esta pesquisa usou apenas palavras exatas. Fontes que falam do seu objetivo com outras palavras podem ter ficado de fora.",
    lexicalOnlyUnavailable:
      "A busca por significado está temporariamente indisponível, então esta pesquisa usou apenas palavras exatas. Tente novamente mais tarde para uma cobertura completa.",
    placeholder: "Quero entender como as empresas usam IA para conciliação de pagamentos.",
    failure: {
      unauthorized: "Entre para pesquisar.",
      invalid_request: "Esse objetivo não pode ser pesquisado.",
      rate_limited: "Pesquisas demais agora há pouco.",
      provider_unavailable: "A pesquisa não está configurada.",
      provider_error: "Não foi possível alcançar o modelo.",
      malformed_response: "Resposta ilegível.",
      network: "Você parece estar sem conexão.",
      unknown: "Algo deu errado.",
    },
  },

  understand: {
    connectionsEyebrow: "Como se conecta",
    connectionsTitle: "As ideias que aparecem sempre juntas",
    connectionsLede:
      "Cada linha aqui é uma contagem, não um palpite: dois conceitos se conectam quando os mesmos itens salvos tratam dos dois. Selecione um para ver o que o liga, e a quais peças.",
    explorerEyebrow: "Encontrar",
    explorerTitle: "Tudo, sem rodeios",
    explorerLede: "A parte em que você procura alguma coisa.",
    sectionsOfThisPage: "Seções desta página",
    concepts: "Conceitos",
    relatedTo: "Relacionado a",
    nothingWithFilters: "Nada a mostrar com estes filtros.",
    introEmpty: "Salve alguma coisa e o Keeply começa a descobrir do que ela trata.",
    introPending: "O Keeply ainda não terminou de ler — os conceitos vão aparecendo aqui conforme ele lê.",
    yourKnowledgeEyebrow: "Seu conhecimento",
    moreThanANumber: "Mas sua biblioteca é mais interessante do que um número.",
    explore: "Explore seu conhecimento",
    whatsInThere: "O que de fato tem aí dentro",
    whatKeeplyFound: "O que o Keeply encontrou na sua biblioteca",
    demoNotice:
      "Estes números vêm de uma biblioteca de exemplo fixa, não da sua conta — esta página mostra como o Keeply apresentaria uma real.",
    noConnectionsYet:
      "As conexões aparecem quando o Keeply tiver lido o bastante da sua biblioteca para encontrar ideias que surgem em mais de uma peça.",
    concepts_n: (count: number, formatted: string): string =>
      count === 1 ? "1 conceito" : `${formatted} conceitos`,
    themes_n: (count: number, formatted: string): string => (count === 1 ? "1 assunto" : `${formatted} assuntos`),
    questions_n: (count: number, formatted: string): string =>
      count === 1 ? "1 pergunta" : `${formatted} perguntas`,
    chapters: {
      signals: "Sinais",
      connections: "Conexões",
      explorer: "Explorador",
    },
    savedThings: (formatted: string): string => `Você salvou ${formatted} coisas.`,
    signals: {
      thingsSaved: "coisas salvas",
      thingsSavedNote: "artigos, vídeos, PDFs e suas próprias notas",
      concepts: "conceitos",
      conceptsNote: "ideias distintas que o Keeply nomeou nas suas fontes",
      themes: "assuntos",
      themesNote: "conceitos que se agrupam em um assunto que você acompanha",
      openQuestions: "perguntas em aberto",
      openQuestionsNote: "levantadas várias vezes, resolvidas em lugar nenhum",
    },
    keeplyFound: "O Keeply encontrou",
    collectingSince: "Colecionando desde",
    footerLive: "Tudo nesta página é lido da sua biblioteca.",
    footerSample:
      "Você está desconectado, então isto mostra uma biblioteca de amostra fixa, não uma conta. Entre para ver a sua.",
    noConnectionForIdea:
      "Nada mais que você salvou carrega esta ideia ao lado de outra ainda. Uma conexão precisa de uma peça que trate das duas.",
  },

  explorer: {
    closeDetail: "Fechar o detalhe",
    savedItem: "Item salvo",
    whatKeeplyUnderstood: "O que o Keeply entendeu",
    inShort: "Em resumo",
    whyItMatters: "Por que importa",
    thePieceItself: "A peça em si",
    connectedKnowledge: "Conhecimento conectado",
    loadFailed: "Não foi possível carregar sua biblioteca agora. Nada foi perdido — recarregue para tentar de novo.",
    nothingSaved: "Nada salvo ainda. Salve um link e ele aparecerá aqui.",
    filterByType: "Filtrar por tipo",
    filterByConcept: "Filtrar por conceito",
    searchYourLibrary: "Buscar na sua biblioteca",
    sortBy: "Ordenar por",
    notReadYet: "O Keeply ainda não leu isto. As ideias que ele encontrar aparecerão aqui conforme avança.",
    noConceptsInSample: "Nenhum conceito nesta amostra.",
    ideasInYourLibrary: "Ideias na sua biblioteca",
    askAboutConcept: "Perguntar sobre este conceito",
    askAboutThis: "Perguntar sobre isto",
    whatDidILearn: (title: string): string => `O que eu aprendi com “${title}”?`,
    sorts: {
      recent: "Recentes",
      relevant: "Relevantes",
      revisited: "Mais revisitados",
    },
    readItInKeeply: "Ler no Keeply",
    openTheOriginal: "Abrir o original",
    exploreConnections: "Explorar conexões",
    revisitedTimes: (count: number): string => `revisitado ${count}×`,
    shown: (visible: number, of: number): string => `${visible} de ${of} exibidos`,
    filteredBy: (concept: string): string => `filtrado por ${concept}`,
    showingMostRecent: (shown: number, total: string): string =>
      `mostrando os ${shown} mais recentes de ${total} salvos`,
    nothingBoth: (concept: string, kind: string): string => `Nada aqui é ao mesmo tempo ${concept} e ${kind}.`,
  },

  voiceSearch: {
    unsupported: "A busca por voz não é compatível com este navegador",
    requesting: "Solicitando permissão do microfone…",
    listening: "Ouvindo — toque para parar",
    processing: "Processando a voz",
    denied: "Permissão do microfone negada — toque para tentar de novo",
    error: "Erro na busca por voz — toque para tentar de novo",
    idle: "Buscar por voz",
  },

  settings: {
    eyebrow: "Configurações",
    title: "Sua conta",
    subtitle: "Ajuste como o Keeply funciona para você.",
    signedInAs: "Conectado como",
    notSignedIn: "Sem login — sua biblioteca está salva neste dispositivo",
    signedIn: "Conectado",
    signInPermanently: "Entrar para salvar de forma permanente",
    signOut: "Sair",
    notBuiltYet: "Ainda não construído",
    profile: "Perfil",
    profileBody: "Seu nome de exibição, avatar e preferências de leitura.",
    appearance: "Aparência",
    appearanceBody: "Temas de leitura, tipografia e densidade do layout.",
    privacy: "Privacidade",
    privacyBody: "Controle o que o Keeply guarda e como isso é usado.",
    yourData: "Seus dados",
    yourDataBody: "Exporte ou apague definitivamente tudo o que você salvou.",
  },

  indexing: {
    heading: "O que o Keeply já leu",
    deploymentUnfinished: "Este ambiente não está completo",
    deploymentHint: "Defina isto no servidor e publique de novo. Esta página é onde você confirma que funcionou.",
    read: "Lidos",
    waiting: "Aguardando",
    inTheQueue: "Na fila",
    failed: "Falharam",
    neverRead: "Nunca lidos",
    textChanged: "Texto mudou desde então",
    noIdeas: "Sem ideias extraídas ainda",
    noSummary: "Sem resumo ainda",
    missingEmbeddings: "Sem embeddings",
    queueing: "Enfileirando…",
    nothingWaiting: "Nada aguardando",
    readWhatsWaiting: "Ler o que está aguardando",
    queued: (count: number): string => (count === 1 ? "1 peça enfileirada." : `${count} peças enfileiradas.`),
    alreadyQueued: (count: number): string => `Já enfileirado — ${count} aguardando.`,
    nothingToQueue: "Nada a enfileirar: tudo já foi lido.",
    queueFailed: "Não foi possível enfileirar o trabalho.",
    readFailed: "Não foi possível ler o que o Keeply já processou.",
    notConfigured: "não configurado",
    configured: "configurado",
  },

  discovery: {
    keyIdeas: "Ideias principais",
    relatedKnowledge: "Conhecimento relacionado",
    loadFailed: "Não foi possível carregar o que sabemos sobre esta peça.",
    guestNotAnalyzed:
      "O que fica salvo só neste navegador não é analisado. Entre para o Keeply ler esses itens.",
    pending: "As ideias principais vão aparecer aqui depois que o Keeply ler esta peça.",
    nothingRelated: "Nada mais do que você salvou compartilha estas ideias ainda.",
    organizations: "Organizações",
    technologies: "Tecnologias e produtos",
    alsoMentioned: "Também mencionados",
    reading: "Lendo sobre o que isto trata…",
    passagesInPiece: (count: number): string =>
      count === 1
        ? "1 passagem nesta peça — veja tudo sobre ela"
        : `${count} passagens nesta peça — veja tudo sobre ela`,
    groups: {
      keyIdeas: "Ideias principais",
      people: "Pessoas",
      organizations: "Organizações",
      technologies: "Tecnologias e produtos",
      alsoMentioned: "Também mencionado",
    },
  },

  guestImport: {
    pendingTitle: (count: number): string =>
      count === 1 ? "1 link está salvo apenas neste dispositivo" : `${count} links estão salvos apenas neste dispositivo`,
    pendingBody:
      "Eles foram salvos antes de você entrar. Mova-os para a sua conta para mantê-los em todos os dispositivos.",
    notNow: "Agora não",
    moveToAccount: "Mover para minha conta",
    moved: (count: number): string =>
      count === 1 ? "1 link movido para a sua conta" : `${count} links movidos para a sua conta`,
    stayed: (count: number): string =>
      count === 1 ? "1 link permaneceu neste dispositivo:" : `${count} links permaneceram neste dispositivo:`,
  },

  library: {
    title: "Biblioteca",
    subtitle: "Tudo o que você salvou.",
    searchPlaceholder: "Pesquise no seu conhecimento",
    clearSearch: "Limpar a busca",
    all: "Tudo",
    filters: {
      article: "Artigos",
      video: "Vídeos",
      pdf: "PDFs",
      podcast: "Podcasts",
      document: "Notas",
      social: "Publicações",
    },
    results: (count: number, query: string): string =>
      count === 1 ? `1 resultado · ${query}` : `${count} resultados · ${query}`,
    searchFailedTitle: "A busca não foi concluída.",
    serverProblem: "Algo deu errado do nosso lado.",
    noMatchTitle: (query: string): string => `Nada corresponde a “${query}”.`,
    noMatchBody: "Tente outra palavra, ou confira a grafia.",
    loadFailedTitle: "Não foi possível carregar sua biblioteca.",
    loadMore: "Carregar mais",
    savedCount: (formatted: string): string => `${formatted} salvos`,
    matchedPassage: "Passagem correspondente",
  },

  home: {
    goodMorning: "Bom dia",
    goodAfternoon: "Boa tarde",
    goodEvening: "Boa noite",
    welcomeBack: "Bem-vindo de volta",
    yourKnowledge: "Seu conhecimento.",
    searchEverything: "Pesquisar tudo o que você salvou",
    askYourKnowledge: "Pergunte ao seu conhecimento",
    saveSomethingNew: "Salvar algo novo",
    recentlySaved: "Salvos recentemente",
    browseLibrary: "Ver a biblioteca",
    allTopics: "Todos os temas",
    topicsPending: "Os temas vão aparecer aqui conforme o Keeply lê o que você salva.",
    discover: "Descobrir",
    openConnections: "Abrir as conexões",
    discoverBody:
      "As ligações entre o que você salvou — conceitos que aparecem juntos com frequência, e as peças em que aparecem.",
    saved: (formatted: string): string => `${formatted} salvos`,
    unread: (formatted: string): string => `${formatted} não lidos`,
    favourites: (count: number, formatted: string): string =>
      count === 1 ? "1 favorito" : `${formatted} favoritos`,
  },

  topicsPage: {
    eyebrow: "Temas",
    title: "Os temas que atravessam sua biblioteca.",
    subtitle: "Os temas surgem sozinhos do que você salva. Maior significa presença mais forte.",
    emptyBody: "Salve algumas coisas e os temas começam a aparecer aqui.",
    emptyTitle: "Nenhum tema ainda.",
    surfaced: (count: number, formatted: string): string =>
      count === 1
        ? "Surgem sozinhos do que você salva · 1 tema"
        : `Surgem sozinhos do que você salva · ${formatted} temas`,
    askAboutThis: "Perguntar sobre isto →",
    pieces: (count: number, formatted: string): string => (count === 1 ? "1 peça" : `${formatted} peças`),
    askQuestion: (topic: string): string => `O que eu salvei sobre ${topic}?`,
    askAboutTopic: "Perguntar sobre este tema",
  },

  palette: {
    label: "Paleta de comandos e busca na biblioteca",
    closeLabel: "Fechar a paleta de comandos",
    placeholder: "Pesquise na sua biblioteca ou digite um comando…",
    listening: "Ouvindo…",
    processing: "Processando…",
    actions: "Ações",
    navigate: "Ir para",
    commands: "Comandos",
    quickActions: "Ações rápidas",
    inYourLibrary: "Na sua biblioteca",
    noCommands: "Nenhum comando encontrado.",
    noMatches: (query: string): string => `Nenhum item salvo corresponde a “${query}”.`,
    searchScope:
      "A busca percorre títulos, fontes, tags e o texto extraído do que você salvou.",
    cmd: {
      save: "Salvar uma URL",
      saveHint: "Adicionar um link à sua biblioteca",
      library: "Ir para a Biblioteca",
      libraryHint: "Todo o conhecimento que você salvou",
      favorites: "Ir para os Favoritos",
      favoritesHint: "Os que você marcou",
      topics: "Ir para os Temas",
      topicsHint: "Temas que atravessam sua biblioteca",
      ask: "Ir para o Perguntar",
      askHint: "Pergunte ao seu conhecimento",
      home: "Ir para o Início",
      homeHint: "Visão geral da sua biblioteca",
    },
  },

  saveDialog: {
    dialogLabel: "Salvar na sua biblioteca",
    heading: "Salvar na biblioteca",
    field: "Cole qualquer coisa que valha a pena lembrar",
    hint: "Vamos buscar a página e extrair o título, o autor e o texto legível.",
    saving: "Salvando na sua biblioteca…",
    saved: "Salvo",
    savedHint: "Buscando a página e extraindo o conteúdo agora — seu card vai se atualizando conforme avança.",
    duplicate: "Já está na sua biblioteca",
    open: "Abrir",
    genericError: "Algo deu errado. Tente de novo.",
  },

  empty: {
    title: "Sua biblioteca começa aqui.",
    body: "Salve algo da web e aparecerá aqui — legível, pesquisável e conectado a tudo o que você guarda.",
    pieceNotHere: "Esta peça não está aqui.",
    mayHaveBeenRemoved: "Ela pode ter sido removida da sua biblioteca.",
    backToLibrary: "Voltar para sua biblioteca",
    noTopicsYet: "Nenhum tema ainda.",
  },

  account: {
    guest: "Visitante",
    yourAccount: "Sua conta",
    savedOnThisDevice: "Salvo neste dispositivo",
    notNow: "Agora não",
    createAnAccount: "Criar uma conta",
    signOutAction: "Sair",
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
    askMainIdeas: (title: string): string => `Quais são as ideias principais de "${title}"?`,
    openTheOriginal: "Abrir o original",
    summaryFailed: "Não foi possível gerar um resumo. Tente novamente.",
    leadImage: (title: string): string => `Imagem principal de ${title}`,
    partialSummary:
      "Este é o resumo que conseguimos extrair da fonte. Abra o original para ler a peça completa.",
    pdfOpensBest: "PDFs abrem melhor no visualizador próprio. Abra em uma nova aba para ler, buscar e baixar.",
    noArticleText: "Salvamos o link, mas esta página não expôs um texto de artigo que pudéssemos extrair.",
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
