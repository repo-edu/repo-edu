import { useMemo } from "react"
import {
  selectChecksDirty,
  selectChecksError,
  selectChecksStatus,
  selectIssueCards,
  useProfileStore,
} from "../stores/profileStore"
import { buildRosterInsights, type IssueCard } from "../utils/issues"

export type { IssueCard }

export function useIssues() {
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const issueCards = useProfileStore(selectIssueCards)
  const checksStatus = useProfileStore(selectChecksStatus)
  const checksError = useProfileStore(selectChecksError)
  const checksDirty = useProfileStore(selectChecksDirty)
  const runChecks = useProfileStore((state) => state.runChecks)

  const rosterInsights = useMemo(
    () => (roster ? buildRosterInsights(roster) : null),
    [roster],
  )

  return {
    issueCards,
    rosterInsights,
    checksStatus,
    checksError,
    checksDirty,
    runChecks,
  }
}
