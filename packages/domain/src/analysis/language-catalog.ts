// ---------------------------------------------------------------------------
// Language catalog — single source of truth for analysis-supported languages.
//
// Each entry maps a language id to its display label, file extensions, and
// comment markers. `DEFAULT_EXTENSIONS`, `SupportedLanguage`,
// `COMMENT_MARKERS`, and `extensionToLanguage` are all derived from this.
// ---------------------------------------------------------------------------

export type CommentMarker = {
  start: string | null
  end: string | null
  line: string | null
  /**
   * When true, an inline `start` marker mid-line does NOT enter block-comment
   * mode (e.g. Ruby `=begin`/`=end` and TeX block markers must start a line).
   */
  mustBeAtBeginning?: boolean
}

export type LanguageEntry = {
  /** Human-readable display name. */
  label: string
  /** File extensions associated with this language; lower-case, no leading dot. */
  extensions: readonly string[]
  /** Comment markers used by `classifyCommentLines`. */
  comment: CommentMarker
}

const C_FAMILY: CommentMarker = { start: "/*", end: "*/", line: "//" }

export const LANGUAGE_CATALOG = {
  ada: {
    label: "Ada",
    extensions: ["ada", "adb", "ads"],
    comment: { start: null, end: null, line: "--" },
  },
  c: {
    label: "C",
    extensions: ["c", "h"],
    comment: C_FAMILY,
  },
  cpp: {
    label: "C++",
    extensions: ["cpp", "cc", "cxx", "hpp", "hh", "hxx"],
    comment: C_FAMILY,
  },
  cs: {
    label: "C#",
    extensions: ["cs"],
    comment: C_FAMILY,
  },
  cif: {
    label: "CIF",
    extensions: ["cif"],
    comment: C_FAMILY,
  },
  clojure: {
    label: "Clojure",
    extensions: ["clj", "cljs", "cljc", "edn"],
    comment: { start: null, end: null, line: ";" },
  },
  dart: {
    label: "Dart",
    extensions: ["dart"],
    comment: C_FAMILY,
  },
  elixir: {
    label: "Elixir",
    extensions: ["ex", "exs"],
    comment: { start: null, end: null, line: "#" },
  },
  fsharp: {
    label: "F#",
    extensions: ["fs", "fsi", "fsx"],
    comment: { start: "(*", end: "*)", line: "//" },
  },
  glsl: {
    label: "GLSL",
    extensions: ["glsl", "vert", "frag"],
    comment: C_FAMILY,
  },
  go: {
    label: "Go",
    extensions: ["go"],
    comment: C_FAMILY,
  },
  haskell: {
    label: "Haskell",
    extensions: ["hs", "lhs"],
    comment: { start: "{-", end: "-}", line: "--" },
  },
  html: {
    label: "HTML",
    extensions: ["html", "htm", "xhtml"],
    comment: { start: "<!--", end: "-->", line: null },
  },
  java: {
    label: "Java",
    extensions: ["java"],
    comment: C_FAMILY,
  },
  js: {
    label: "JavaScript",
    extensions: ["js", "mjs", "cjs"],
    comment: C_FAMILY,
  },
  jsx: {
    label: "JSX",
    extensions: ["jsx"],
    comment: C_FAMILY,
  },
  kotlin: {
    label: "Kotlin",
    extensions: ["kt", "kts"],
    comment: C_FAMILY,
  },
  lilypond: {
    label: "LilyPond",
    extensions: ["ly", "ily"],
    comment: { start: "%{", end: "%}", line: "%" },
  },
  lua: {
    label: "Lua",
    extensions: ["lua"],
    comment: { start: "--[[", end: "]]", line: "--" },
  },
  ocaml: {
    label: "OCaml",
    extensions: ["ml", "mli"],
    comment: { start: "(*", end: "*)", line: null },
  },
  perl: {
    label: "Perl",
    extensions: ["pl", "pm"],
    comment: { start: null, end: null, line: "#" },
  },
  php: {
    label: "PHP",
    extensions: ["php"],
    comment: C_FAMILY,
  },
  po: {
    label: "Gettext",
    extensions: ["po", "pot"],
    comment: { start: null, end: null, line: "#" },
  },
  py: {
    label: "Python",
    extensions: ["py"],
    comment: { start: '"""', end: '"""', line: "#" },
  },
  r: {
    label: "R",
    extensions: ["r"],
    comment: { start: null, end: null, line: "#" },
  },
  rb: {
    label: "Ruby",
    extensions: ["rb"],
    comment: {
      start: "=begin",
      end: "=end",
      line: "#",
      mustBeAtBeginning: true,
    },
  },
  robot: {
    label: "Robot Framework",
    extensions: ["robot"],
    comment: { start: null, end: null, line: "#" },
  },
  rs: {
    label: "Rust",
    extensions: ["rs", "rlib"],
    comment: { start: null, end: null, line: "//" },
  },
  scala: {
    label: "Scala",
    extensions: ["scala", "sc"],
    comment: C_FAMILY,
  },
  shell: {
    label: "Shell",
    extensions: ["sh", "bash", "zsh"],
    comment: { start: null, end: null, line: "#" },
  },
  sql: {
    label: "SQL",
    extensions: ["sql"],
    comment: { start: "/*", end: "*/", line: "--" },
  },
  svelte: {
    label: "Svelte",
    extensions: ["svelte"],
    comment: { start: "<!--", end: "-->", line: null },
  },
  swift: {
    label: "Swift",
    extensions: ["swift"],
    comment: C_FAMILY,
  },
  tex: {
    label: "TeX",
    extensions: ["tex"],
    comment: {
      start: "\\begin{comment}",
      end: "\\end{comment}",
      line: "%",
      mustBeAtBeginning: true,
    },
  },
  tooldef: {
    label: "ToolDef",
    extensions: ["tooldef"],
    comment: C_FAMILY,
  },
  ts: {
    label: "TypeScript",
    extensions: ["ts", "mts", "cts"],
    comment: C_FAMILY,
  },
  tsx: {
    label: "TSX",
    extensions: ["tsx"],
    comment: C_FAMILY,
  },
  vue: {
    label: "Vue",
    extensions: ["vue"],
    comment: { start: "<!--", end: "-->", line: null },
  },
  xml: {
    label: "XML",
    extensions: ["xml", "jspx"],
    comment: { start: "<!--", end: "-->", line: null },
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

export function isSupportedExtension(ext: string): boolean {
  return EXTENSION_INDEX.has(normalizeExtension(ext))
}
