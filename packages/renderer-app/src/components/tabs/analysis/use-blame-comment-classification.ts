import type { FileBlame } from "@repo-edu/domain/analysis"
import {
  classifyCommentLines,
  extensionToTokenizerLanguage,
} from "@repo-edu/domain/analysis"
import { loadRendererTokenizerLanguage } from "@repo-edu/renderer-app/source-tokenizer"
import { useEffect, useRef, useState } from "react"
import {
  MAX_HIGHLIGHT_BYTES,
  MAX_HIGHLIGHT_LINES,
} from "../../../utils/blame-highlighter.js"

function getFileExtension(path: string): string {
  const dot = path.lastIndexOf(".")
  return dot >= 0 ? path.slice(dot + 1) : ""
}

export function useBlameCommentClassification(
  fileBlame: FileBlame | null,
): Set<number> | null {
  const cacheRef = useRef<WeakMap<FileBlame, Set<number>>>(new WeakMap())
  const versionRef = useRef(0)
  const [commentLines, setCommentLines] = useState<Set<number> | null>(null)

  useEffect(() => {
    versionRef.current += 1
    const localVersion = versionRef.current

    if (!fileBlame) {
      setCommentLines(null)
      return
    }

    if (fileBlame.lines.length > MAX_HIGHLIGHT_LINES) {
      setCommentLines(null)
      return
    }

    const source = fileBlame.lines.map((line) => line.content).join("\n")
    if (source.length > MAX_HIGHLIGHT_BYTES) {
      setCommentLines(null)
      return
    }

    const language = extensionToTokenizerLanguage(
      getFileExtension(fileBlame.path),
    )
    if (!language) {
      setCommentLines(null)
      return
    }

    const cached = cacheRef.current.get(fileBlame)
    if (cached) {
      setCommentLines(cached)
      return
    }

    void (async () => {
      const loaded = await loadRendererTokenizerLanguage(language)
      if (versionRef.current !== localVersion) return

      const result = classifyCommentLines(
        fileBlame.lines.map((line) => line.content),
        loaded,
      )
      if (versionRef.current !== localVersion) return

      cacheRef.current.set(fileBlame, result)
      setCommentLines(result)
    })()
  }, [fileBlame])

  return commentLines
}
