import type { DocumentKind } from "@repo-edu/domain/types"
import { useEffect, useRef } from "react"
import { useAnalysisStore } from "../stores/analysis-store.js"
import { useCourseStore } from "../stores/course-store.js"

/**
 * Loads the active document into the course store when its identity changes.
 * Dispatches to the right workflow based on `documentKind`. Ignores stale
 * results if the active document changed before loading completed.
 */
export function useLoadCourse(
  documentKind: DocumentKind | null,
  documentId: string | null,
): void {
  const loadKeyRef = useRef<string | null>(null)

  useEffect(() => {
    useAnalysisStore.getState().resetAnalysisContext()
    if (documentKind === null || documentId === null) {
      useCourseStore.getState().clear()
      loadKeyRef.current = null
      return
    }

    const key = `${documentKind}:${documentId}`
    loadKeyRef.current = key
    if (documentKind === "analysis") {
      void useCourseStore.getState().loadAnalysis(documentId)
    } else {
      void useCourseStore.getState().load(documentId)
    }
  }, [documentKind, documentId])
}
