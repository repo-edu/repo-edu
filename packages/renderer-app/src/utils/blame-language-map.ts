export type ShikiLangId =
  | "python"
  | "typescript"
  | "tsx"
  | "javascript"
  | "jsx"
  | "java"
  | "kotlin"
  | "swift"
  | "c"
  | "cpp"
  | "csharp"
  | "go"
  | "rust"
  | "ruby"
  | "php"
  | "scala"
  | "haskell"
  | "sql"
  | "html"
  | "xml"
  | "glsl"
  | "ocaml"
  | "latex"
  | "markdown"
  | "yaml"
  | "json"
  | "jsonc"
  | "toml"
  | "bash"
  | "css"
  | "scss"
  | "dart"
  | "lua"
  | "r"
  | "clojure"
  | "elixir"
  | "vue"
  | "svelte"

const EXTENSION_TO_SHIKI: Record<string, ShikiLangId> = {
  py: "python",
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hh: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  scala: "scala",
  hs: "haskell",
  sql: "sql",
  html: "html",
  xhtml: "html",
  xml: "xml",
  jspx: "xml",
  glsl: "glsl",
  ml: "ocaml",
  mli: "ocaml",
  tex: "latex",
  md: "markdown",
  markdown: "markdown",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  jsonc: "jsonc",
  toml: "toml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  css: "css",
  scss: "scss",
  dart: "dart",
  lua: "lua",
  r: "r",
  clj: "clojure",
  cljs: "clojure",
  ex: "elixir",
  exs: "elixir",
  vue: "vue",
  svelte: "svelte",
}

export function extensionToShikiLang(ext: string): ShikiLangId | null {
  const normalized = ext.toLowerCase().replace(/^\./, "")
  return EXTENSION_TO_SHIKI[normalized] ?? null
}

export function allMappedShikiLangs(): readonly ShikiLangId[] {
  return Object.values(EXTENSION_TO_SHIKI)
}
