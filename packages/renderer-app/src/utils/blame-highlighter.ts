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
import { bundledLanguagesInfo } from "shiki"
import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import type { ThemedToken } from "shiki/types"
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

const LANG_INFO_BY_ID: ReadonlyMap<
  ShikiLangId,
  (typeof bundledLanguagesInfo)[number]
> = new Map(
  bundledLanguagesInfo.map((info) => [info.id as ShikiLangId, info] as const),
)

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
  const info = LANG_INFO_BY_ID.get(langId)
  if (!info) return false
  const highlighter = await getHighlighter()
  let promise = langPromises.get(langId)
  if (!promise) {
    promise = info.import().then(async (mod) => {
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
