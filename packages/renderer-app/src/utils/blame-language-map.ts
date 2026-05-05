import { type BundledLanguage, bundledLanguagesInfo } from "shiki"

export type ShikiLangId = BundledLanguage

/**
 * Extensions that aren't directly recognised as a language id or alias by
 * shiki's bundle metadata. Add an entry here only when an extension is missing
 * from `bundledLanguagesInfo[].id`/`aliases` for its language.
 */
const EXTENSION_OVERRIDES: Record<string, BundledLanguage> = {
  cc: "cpp",
  cxx: "cpp",
  hh: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  cljs: "clojure",
  cljc: "clojure",
  edn: "clojure",
  ex: "elixir",
  exs: "elixir",
  mli: "ocaml",
  ml: "ocaml",
  xhtml: "html",
  htm: "html",
  jspx: "xml",
  vert: "glsl",
  frag: "glsl",
  pm: "perl",
  fs: "fsharp",
  fsi: "fsharp",
  fsx: "fsharp",
  sc: "scala",
  lhs: "haskell",
}

const EXTENSION_INDEX: ReadonlyMap<string, BundledLanguage> = (() => {
  const map = new Map<string, BundledLanguage>()
  for (const info of bundledLanguagesInfo) {
    map.set(info.id, info.id as BundledLanguage)
    for (const alias of info.aliases ?? []) {
      if (!map.has(alias)) map.set(alias, info.id as BundledLanguage)
    }
  }
  for (const [ext, id] of Object.entries(EXTENSION_OVERRIDES)) {
    map.set(ext, id)
  }
  return map
})()

export function extensionToShikiLang(ext: string): ShikiLangId | null {
  const normalized = ext.toLowerCase().replace(/^\./, "")
  return EXTENSION_INDEX.get(normalized) ?? null
}
