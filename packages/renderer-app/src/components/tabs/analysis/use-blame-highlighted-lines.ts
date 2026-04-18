import type { FileBlame } from "@repo-edu/domain/analysis"
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

type LangCache = Map<ShikiLangId, ThemedToken[][]>

export function useBlameHighlightedLines(
  fileBlame: FileBlame | null,
  syntaxColorize: boolean,
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

    const cached = cacheRef.current.get(fileBlame)?.get(langId)
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

      const result = tokenizeLines(source, langId)
      if (versionRef.current !== localVersion) return

      let langCache = cacheRef.current.get(fileBlame)
      if (!langCache) {
        langCache = new Map()
        cacheRef.current.set(fileBlame, langCache)
      }
      langCache.set(langId, result)
      setTokens(result)
    })()
  }, [fileBlame, syntaxColorize])

  return tokens
}
