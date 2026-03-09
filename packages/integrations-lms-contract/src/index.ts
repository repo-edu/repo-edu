import type { Group, GroupSet, LmsProviderKind, Roster } from "@repo-edu/domain"

export const packageId = "@repo-edu/integrations-lms-contract"

export const supportedLmsProviders = ["canvas", "moodle"] as const

export type LmsConnectionDraft = {
  provider: LmsProviderKind
  baseUrl: string
  token: string
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

export type LmsFetchedGroupSet = {
  groupSet: GroupSet
  groups: Group[]
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
  ): Promise<Roster>
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
