import type {
  GroupSetConnection,
  RosterConnection,
} from "@repo-edu/domain/types"
import { supportedLmsProviders } from "@repo-edu/integrations-lms-contract"

const lmsProviderKindSet = new Set<string>(supportedLmsProviders)

type LmsConnectionKind = (typeof supportedLmsProviders)[number]

type LmsRosterConnection = Extract<
  RosterConnection,
  { kind: LmsConnectionKind }
>
type LmsGroupSetConnection = Extract<
  GroupSetConnection,
  { kind: LmsConnectionKind }
>

function isSupportedLmsProviderKind(
  kind: string | null | undefined,
): kind is LmsConnectionKind {
  if (kind === null || kind === undefined) {
    return false
  }
  return lmsProviderKindSet.has(kind)
}

export function isLmsRosterConnection(
  connection: RosterConnection | null | undefined,
): connection is LmsRosterConnection {
  return isSupportedLmsProviderKind(connection?.kind)
}

export function isLmsGroupSetConnection(
  connection: GroupSetConnection | null | undefined,
): connection is LmsGroupSetConnection {
  return isSupportedLmsProviderKind(connection?.kind)
}
