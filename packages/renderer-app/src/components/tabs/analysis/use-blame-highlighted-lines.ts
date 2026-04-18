import type { FileBlame } from "@repo-edu/domain/analysis"
import type { SyntaxThemeId } from "@repo-edu/domain/settings"
import { useEffect, useRef, useState } from "react"
import type { ThemedToken } from "shiki/types"
import {
  ensureLanguage,
  MAX_HIGHLIGHT_BYTES,
  MAX_HIGHLIGHT_LINES,
  tokenizeLines,
} from "../../../utils/blame-highlighter.js"
import {
  extensionToShikiLang,
  type ShikiLangId,
} from "../../../utils/blame-language-map.js"

function getFileExtension(path: string): string {
  const dot = path.lastIndexOf(".")
  return dot >= 0 ? path.slice(dot + 1) : ""
}

type CacheKey = `${ShikiLangId}:${SyntaxThemeId}`
type LangCache = Map<CacheKey, ThemedToken[][]>

export function useBlameHighlightedLines(
  fileBlame: FileBlame | null,
  syntaxColorize: boolean,
  themeId: SyntaxThemeId,
): ThemedToken[][] | null {
  const cacheRef = useRef<WeakMap<FileBlame, LangCache>>(new WeakMap())
  const versionRef = useRef(0)
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null)

  useEffect(() => {
    versionRef.current += 1
    const localVersion = versionRef.current

    if (!syntaxColorize || !fileBlame) {
      setTokens(null)
      return
    }

    const langId = extensionToShikiLang(getFileExtension(fileBlame.path))
    if (!langId) {
      setTokens(null)
      return
    }

    if (fileBlame.lines.length > MAX_HIGHLIGHT_LINES) {
      setTokens(null)
      return
    }

    const cacheKey: CacheKey = `${langId}:${themeId}`
    const cached = cacheRef.current.get(fileBlame)?.get(cacheKey)
    if (cached) {
      setTokens(cached)
      return
    }

    void (async () => {
      const ok = await ensureLanguage(langId)
      if (versionRef.current !== localVersion) return
      if (!ok) {
        setTokens(null)
        return
      }

      const source = fileBlame.lines.map((l) => l.content).join("\n")
      if (source.length > MAX_HIGHLIGHT_BYTES) {
        setTokens(null)
        return
      }

      const result = tokenizeLines(source, langId, themeId)
      if (versionRef.current !== localVersion) return

      let langCache = cacheRef.current.get(fileBlame)
      if (!langCache) {
        langCache = new Map()
        cacheRef.current.set(fileBlame, langCache)
      }
      langCache.set(cacheKey, result)
      setTokens(result)
    })()
  }, [fileBlame, syntaxColorize, themeId])

  return tokens
}
