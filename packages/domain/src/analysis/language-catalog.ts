// ---------------------------------------------------------------------------
// Language catalog — single source of truth for analysis-supported languages.
//
// Each entry maps a language id to its display label and file extensions.
// `DEFAULT_EXTENSIONS`, `SupportedLanguage`, and `extensionToLanguage` are all
// derived from this.
// ---------------------------------------------------------------------------

export type LanguageEntry = {
  /** Human-readable display name. */
  label: string
  /** File extensions associated with this language; lower-case, no leading dot. */
  extensions: readonly string[]
}

export const LANGUAGE_CATALOG = {
  ada: {
    label: "Ada",
    extensions: ["ada", "adb", "ads"],
  },
  c: {
    label: "C",
    extensions: ["c", "h"],
  },
  cpp: {
    label: "C++",
    extensions: ["cpp", "cc", "cxx", "hpp", "hh", "hxx"],
  },
  cs: {
    label: "C#",
    extensions: ["cs"],
  },
  cif: {
    label: "CIF",
    extensions: ["cif"],
  },
  clojure: {
    label: "Clojure",
    extensions: ["clj", "cljs", "cljc", "edn"],
  },
  dart: {
    label: "Dart",
    extensions: ["dart"],
  },
  elixir: {
    label: "Elixir",
    extensions: ["ex", "exs"],
  },
  fsharp: {
    label: "F#",
    extensions: ["fs", "fsi", "fsx"],
  },
  glsl: {
    label: "GLSL",
    extensions: ["glsl", "vert", "frag"],
  },
  go: {
    label: "Go",
    extensions: ["go"],
  },
  haskell: {
    label: "Haskell",
    extensions: ["hs", "lhs"],
  },
  html: {
    label: "HTML",
    extensions: ["html", "htm", "xhtml"],
  },
  java: {
    label: "Java",
    extensions: ["java"],
  },
  js: {
    label: "JavaScript",
    extensions: ["js", "mjs", "cjs"],
  },
  jsx: {
    label: "JSX",
    extensions: ["jsx"],
  },
  kotlin: {
    label: "Kotlin",
    extensions: ["kt", "kts"],
  },
  lilypond: {
    label: "LilyPond",
    extensions: ["ly", "ily"],
  },
  lua: {
    label: "Lua",
    extensions: ["lua"],
  },
  matlab: {
    label: "MATLAB",
    extensions: ["m"],
  },
  ocaml: {
    label: "OCaml",
    extensions: ["ml", "mli"],
  },
  perl: {
    label: "Perl",
    extensions: ["pl", "pm"],
  },
  php: {
    label: "PHP",
    extensions: ["php"],
  },
  po: {
    label: "Gettext",
    extensions: ["po", "pot"],
  },
  py: {
    label: "Python",
    extensions: ["py"],
  },
  r: {
    label: "R",
    extensions: ["r"],
  },
  rb: {
    label: "Ruby",
    extensions: ["rb"],
  },
  robot: {
    label: "Robot Framework",
    extensions: ["robot"],
  },
  rs: {
    label: "Rust",
    extensions: ["rs", "rlib"],
  },
  scala: {
    label: "Scala",
    extensions: ["scala", "sc"],
  },
  shell: {
    label: "Shell",
    extensions: ["sh", "bash", "zsh"],
  },
  sql: {
    label: "SQL",
    extensions: ["sql"],
  },
  svelte: {
    label: "Svelte",
    extensions: ["svelte"],
  },
  swift: {
    label: "Swift",
    extensions: ["swift"],
  },
  tex: {
    label: "TeX",
    extensions: ["tex"],
  },
  tooldef: {
    label: "ToolDef",
    extensions: ["tooldef"],
  },
  toml: {
    label: "TOML",
    extensions: ["toml"],
  },
  ts: {
    label: "TypeScript",
    extensions: ["ts", "mts", "cts"],
  },
  tsx: {
    label: "TSX",
    extensions: ["tsx"],
  },
  vue: {
    label: "Vue",
    extensions: ["vue"],
  },
  xml: {
    label: "XML",
    extensions: ["xml", "jspx"],
  },
} as const satisfies Record<string, LanguageEntry>

export type SupportedLanguage = keyof typeof LANGUAGE_CATALOG

export const SUPPORTED_LANGUAGES = Object.keys(
  LANGUAGE_CATALOG,
) as SupportedLanguage[]

const EXTENSION_INDEX: ReadonlyMap<string, SupportedLanguage> = (() => {
  const index = new Map<string, SupportedLanguage>()
  for (const [id, entry] of Object.entries(LANGUAGE_CATALOG) as [
    SupportedLanguage,
    LanguageEntry,
  ][]) {
    for (const ext of entry.extensions) {
      // First language to claim an extension wins; declarations that share
      // an extension are a catalog bug, not a runtime concern.
      if (!index.has(ext)) index.set(ext, id)
    }
  }
  return index
})()

export const DEFAULT_EXTENSIONS: readonly string[] = (() => {
  const seen = new Set<string>()
  for (const entry of Object.values(LANGUAGE_CATALOG)) {
    for (const ext of entry.extensions) seen.add(ext)
  }
  return [...seen].sort()
})()

export function normalizeExtension(ext: string): string {
  return ext.trim().toLowerCase().replace(/^\./, "")
}

export function extensionToLanguage(
  ext: string,
): SupportedLanguage | undefined {
  return EXTENSION_INDEX.get(normalizeExtension(ext))
}
