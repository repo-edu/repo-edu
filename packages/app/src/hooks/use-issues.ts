import {
  selectChecksDirty,
  selectChecksError,
  selectChecksStatus,
  selectIssueCards,
  useProfileStore,
} from "../stores/profile-store.js"
import type { RosterInsights } from "../types/index.js"
import { buildRosterInsights } from "../utils/issues.js"

export function useIssues() {
  const issueCards = useProfileStore(selectIssueCards)
  const checksStatus = useProfileStore(selectChecksStatus)
  const checksError = useProfileStore(selectChecksError)
  const checksDirty = useProfileStore(selectChecksDirty)
  const roster = useProfileStore((s) => s.profile?.roster ?? null)

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
