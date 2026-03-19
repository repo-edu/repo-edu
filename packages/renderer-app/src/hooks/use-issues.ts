import {
  selectChecksDirty,
  selectChecksError,
  selectChecksStatus,
  selectIssueCards,
  useCourseStore,
} from "../stores/course-store.js"
import type { RosterInsights } from "../types/index.js"
import { buildRosterInsights } from "../utils/issues.js"

export function useIssues() {
  const issueCards = useCourseStore(selectIssueCards)
  const checksStatus = useCourseStore(selectChecksStatus)
  const checksError = useCourseStore(selectChecksError)
  const checksDirty = useCourseStore(selectChecksDirty)
  const roster = useCourseStore((s) => s.course?.roster ?? null)

  const rosterInsights: RosterInsights | null = roster
    ? buildRosterInsights(roster)
    : null

  return {
    issueCards,
    rosterInsights,
    checksStatus,
    checksError,
    checksDirty,
  }
}
