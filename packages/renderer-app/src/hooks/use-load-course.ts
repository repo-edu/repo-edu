import { useEffect, useRef } from "react"
import { useAnalysisStore } from "../stores/analysis-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { selectActiveCourseId, useUiStore } from "../stores/ui-store.js"

export function useLoadCourse(courseId: string | null): void {
  const loadKeyRef = useRef<string | null>(null)

  useEffect(() => {
    useAnalysisStore.getState().resetAnalysisContext()
    if (courseId === null) {
      useCourseStore.getState().clear()
      loadKeyRef.current = null
      return
    }

    const key = `course:${courseId}`
    loadKeyRef.current = key
    if (selectActiveCourseId(useUiStore.getState()) !== courseId) {
      return
    }
    void useCourseStore.getState().load(courseId)
  }, [courseId])
}
