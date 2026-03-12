import { useCallback, useEffect, useRef, useState } from "react"
import { selectCourseStatus, useCourseStore } from "../stores/course-store.js"
import { hashSnapshot } from "../utils/snapshot.js"

/**
 * Tracks whether the current course has unsaved changes using FNV-1a hashing.
 * Resets the baseline when the active course changes or when `markClean` is called.
 */
export function useDirtyState(activeCourseId: string | null) {
  const [isDirty, setIsDirty] = useState(false)
  const baselineRef = useRef<number>(0)
  const courseStatus = useCourseStore(selectCourseStatus)
  const loadedCourseId = useCourseStore((state) => state.course?.id ?? null)

  const computeHash = useCallback(() => {
    const course = useCourseStore.getState().course
    if (!course) return 0
    return hashSnapshot({
      roster: course.roster,
      courseId: course.lmsCourseId,
      gitConnectionName: course.gitConnectionName,
      lmsConnectionName: course.lmsConnectionName,
      repositoryTemplate: course.repositoryTemplate,
    })
  }, [])

  const markClean = useCallback(() => {
    baselineRef.current = computeHash()
    setIsDirty(false)
  }, [computeHash])

  const forceDirty = useCallback(() => {
    setIsDirty(true)
  }, [])

  // Reset baseline only when the active course is actually loaded.
  useEffect(() => {
    if (activeCourseId === null) {
      baselineRef.current = 0
      setIsDirty(false)
      return
    }

    if (courseStatus !== "loaded" || loadedCourseId !== activeCourseId) {
      return
    }

    baselineRef.current = computeHash()
    setIsDirty(false)
  }, [activeCourseId, courseStatus, loadedCourseId, computeHash])

  // Subscribe to course store changes.
  useEffect(() => {
    const unsub = useCourseStore.subscribe(() => {
      const current = computeHash()
      setIsDirty(current !== baselineRef.current)
    })
    return unsub
  }, [computeHash])

  return { isDirty, markClean, forceDirty }
}
