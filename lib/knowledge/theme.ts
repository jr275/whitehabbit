export type KnowledgeTheme = "clean" | "black"

export const KN_THEME_COOKIE = "kn-theme"

export function parseKnowledgeTheme(value: string | undefined): KnowledgeTheme {
  return value === "black" ? "black" : "clean"
}

export function persistKnowledgeTheme(theme: KnowledgeTheme) {
  document.cookie = `${KN_THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`
}
