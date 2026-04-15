import type { ConnectionBase } from "@repo-edu/domain/connection"
import type { LmsProviderKind } from "@repo-edu/domain/types"

export const packageId = "@repo-edu/integrations-lms-contract"

export const supportedLmsProviders = ["canvas", "moodle"] as const

export type LmsConnectionDraft = ConnectionBase & {
  provider: LmsProviderKind
}

export type LmsCourseSummary = {
  id: string
  name: string
  code: string | null
}

export type LmsGroupSetSummary = {
  id: string
  name: string
  groupCount: number
}

export type RemoteLmsMember = {
  id: string
  lmsUserId: string
  name: string
  email: string | null
  studentNumber: string | null
  enrollmentType: string
  enrollmentDisplay: string | null
  status: "active" | "incomplete" | "dropped"
  lmsStatus: "active" | "incomplete" | "dropped" | null
  source: string
}

export type RemoteLmsGroupSet = {
  id: string
  name: string
}

export type RemoteLmsGroup = {
  id: string
  name: string
  memberLmsUserIds: string[]
}

export type LmsFetchedGroupSet = {
  groupSet: RemoteLmsGroupSet
  groups: RemoteLmsGroup[]
}

export type LmsClient = {
  verifyConnection(
    draft: LmsConnectionDraft,
    signal?: AbortSignal,
  ): Promise<{ verified: boolean }>
  listCourses(
    draft: LmsConnectionDraft,
    signal?: AbortSignal,
  ): Promise<LmsCourseSummary[]>
  fetchRoster(
    draft: LmsConnectionDraft,
    courseId: string,
    signal?: AbortSignal,
    onProgress?: (message: string) => void,
  ): Promise<RemoteLmsMember[]>
  listGroupSets(
    draft: LmsConnectionDraft,
    courseId: string,
    signal?: AbortSignal,
  ): Promise<LmsGroupSetSummary[]>
  fetchGroupSet(
    draft: LmsConnectionDraft,
    courseId: string,
    groupSetId: string,
    signal?: AbortSignal,
    onProgress?: (message: string) => void,
  ): Promise<LmsFetchedGroupSet>
}
