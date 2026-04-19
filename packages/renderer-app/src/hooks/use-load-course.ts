import { useEffect, useRef } from "react"
import { useAnalysisStore } from "../stores/analysis-store.js"
import { useCourseStore } from "../stores/course-store.js"

/**
 * Loads a course into the course store when `courseId` changes.
 * Ignores stale results if the course changed before loading completed.
 */
export function useLoadCourse(courseId: string | null): void {
  const loadIdRef = useRef<string | null>(null)

  useEffect(() => {
    useAnalysisStore.getState().resetAnalysisContext()
    if (!courseId) {
      useCourseStore.getState().clear()
      loadIdRef.current = null
      return
    }

    loadIdRef.current = courseId
    void useCourseStore.getState().load(courseId)
  }, [courseId])
}
