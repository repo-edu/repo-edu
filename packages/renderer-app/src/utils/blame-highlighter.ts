import type { SyntaxThemeId } from "@repo-edu/domain/settings"
import darkPlus from "@shikijs/themes/dark-plus"
import everforestDark from "@shikijs/themes/everforest-dark"
import everforestLight from "@shikijs/themes/everforest-light"
import githubDark from "@shikijs/themes/github-dark"
import githubDarkDimmed from "@shikijs/themes/github-dark-dimmed"
import githubLight from "@shikijs/themes/github-light"
import lightPlus from "@shikijs/themes/light-plus"
import minDark from "@shikijs/themes/min-dark"
import minLight from "@shikijs/themes/min-light"
import nord from "@shikijs/themes/nord"
import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import type { LanguageRegistration, ThemedToken } from "shiki/types"
import type { ShikiLangId } from "./blame-language-map.js"

export const MAX_HIGHLIGHT_LINES = 5000
export const MAX_HIGHLIGHT_BYTES = 250_000

export const SYNTAX_THEMES: Record<
  SyntaxThemeId,
  { readonly label: string; readonly light: string; readonly dark: string }
> = {
  plus: {
    label: "Plus (VSCode default)",
    light: "light-plus",
    dark: "dark-plus",
  },
  github: { label: "GitHub", light: "github-light", dark: "github-dark" },
  "github-dimmed": {
    label: "GitHub (dimmed dark)",
    light: "github-light",
    dark: "github-dark-dimmed",
  },
  everforest: {
    label: "Everforest",
    light: "everforest-light",
    dark: "everforest-dark",
  },
  nord: { label: "Nord", light: "min-light", dark: "nord" },
  min: { label: "Min", light: "min-light", dark: "min-dark" },
}

type LangModule = { default: LanguageRegistration[] }

const LANG_LOADERS: Record<ShikiLangId, () => Promise<LangModule>> = {
  python: () => import("@shikijs/langs/python"),
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  javascript: () => import("@shikijs/langs/javascript"),
  jsx: () => import("@shikijs/langs/jsx"),
  java: () => import("@shikijs/langs/java"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  swift: () => import("@shikijs/langs/swift"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  go: () => import("@shikijs/langs/go"),
  rust: () => import("@shikijs/langs/rust"),
  ruby: () => import("@shikijs/langs/ruby"),
  php: () => import("@shikijs/langs/php"),
  scala: () => import("@shikijs/langs/scala"),
  haskell: () => import("@shikijs/langs/haskell"),
  sql: () => import("@shikijs/langs/sql"),
  html: () => import("@shikijs/langs/html"),
  xml: () => import("@shikijs/langs/xml"),
  glsl: () => import("@shikijs/langs/glsl"),
  ocaml: () => import("@shikijs/langs/ocaml"),
  latex: () => import("@shikijs/langs/latex"),
  markdown: () => import("@shikijs/langs/markdown"),
  yaml: () => import("@shikijs/langs/yaml"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  toml: () => import("@shikijs/langs/toml"),
  bash: () => import("@shikijs/langs/bash"),
  css: () => import("@shikijs/langs/css"),
  scss: () => import("@shikijs/langs/scss"),
  dart: () => import("@shikijs/langs/dart"),
  lua: () => import("@shikijs/langs/lua"),
  r: () => import("@shikijs/langs/r"),
  clojure: () => import("@shikijs/langs/clojure"),
  elixir: () => import("@shikijs/langs/elixir"),
  vue: () => import("@shikijs/langs/vue"),
  svelte: () => import("@shikijs/langs/svelte"),
}

let highlighterRef: HighlighterCore | null = null
let highlighterPromise: Promise<HighlighterCore> | null = null
const langPromises = new Map<ShikiLangId, Promise<void>>()

async function getHighlighter(): Promise<HighlighterCore> {
  if (highlighterRef) return highlighterRef
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [
        darkPlus,
        lightPlus,
        githubDark,
        githubDarkDimmed,
        githubLight,
        everforestDark,
        everforestLight,
        nord,
        minDark,
        minLight,
      ],
      engine: createJavaScriptRegexEngine(),
    })
  }
  highlighterRef = await highlighterPromise
  return highlighterRef
}

export async function ensureLanguage(langId: ShikiLangId): Promise<boolean> {
  const loader = LANG_LOADERS[langId]
  if (!loader) return false
  const highlighter = await getHighlighter()
  let promise = langPromises.get(langId)
  if (!promise) {
    promise = loader().then(async (mod) => {
      await highlighter.loadLanguage(mod.default)
    })
    langPromises.set(langId, promise)
  }
  await promise
  return true
}

export function tokenizeLines(
  source: string,
  langId: ShikiLangId,
  themeId: SyntaxThemeId,
): ThemedToken[][] {
  if (!highlighterRef) {
    throw new Error(
      "blame-highlighter: ensureLanguage must be awaited before tokenizeLines",
    )
  }
  const pair = SYNTAX_THEMES[themeId]
  const result = highlighterRef.codeToTokens(source, {
    lang: langId,
    themes: { light: pair.light, dark: pair.dark },
    defaultColor: false,
  })
  return result.tokens
}

export function splitOffLeading(
  tokens: ThemedToken[],
  leadingCount: number,
): ThemedToken[] {
  if (leadingCount <= 0) return tokens
  let remaining = leadingCount
  const out: ThemedToken[] = []
  for (const token of tokens) {
    if (remaining === 0) {
      out.push(token)
      continue
    }
    if (token.content.length <= remaining) {
      remaining -= token.content.length
      continue
    }
    out.push({
      ...token,
      content: token.content.slice(remaining),
      offset: token.offset + remaining,
    })
    remaining = 0
  }
  return out
}
