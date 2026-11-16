import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { subscribeCourseRemoval } from "../session/source-lifecycle-events.js"

function queryKeyBelongsToCourse(value: unknown, courseId: string): boolean {
  if (Array.isArray(value)) {
    if (value[0] === "course" && value[1] === courseId) return true
    if (value[0] === "submission" && value[2] === courseId) return true
    return value.some((entry) => queryKeyBelongsToCourse(entry, courseId))
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((entry) =>
      queryKeyBelongsToCourse(entry, courseId),
    )
  }
  return false
}

/** Removes every cached result whose source is a removed course, including the
 * submissions opened for it. */
export function useAnalysisCourseRemoval(): void {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      subscribeCourseRemoval((courseId) => {
        queryClient.removeQueries({
          predicate: (query) =>
            queryKeyBelongsToCourse(query.queryKey, courseId),
        })
      }),
    [queryClient],
  )
}
