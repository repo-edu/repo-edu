import type { Group, Roster } from "@repo-edu/domain"
import { normalizeRoster } from "@repo-edu/domain"
import type { HttpPort, HttpResponse } from "@repo-edu/host-runtime-contract"
import type {
  LmsClient,
  LmsConnectionDraft,
  LmsCourseSummary,
  LmsFetchedGroupSet,
  LmsGroupSetSummary,
} from "@repo-edu/integrations-lms-contract"

class CanvasRequestStatusError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Canvas request failed with status ${status}.`)
    this.name = "CanvasRequestStatusError"
    this.status = status
  }
}

function resolveApiBase(draft: LmsConnectionDraft): string {
  const base = draft.baseUrl.replace(/\/+$/, "")
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`
}

function createHeaders(draft: LmsConnectionDraft): Record<string, string> {
  return {
    Authorization: `Bearer ${draft.token}`,
    Accept: "application/json",
  }
}

function resolveUrl(draft: LmsConnectionDraft, pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) {
    return pathOrUrl
  }

  return `${resolveApiBase(draft)}${pathOrUrl}`
}

async function canvasRequest(
  http: HttpPort,
  draft: LmsConnectionDraft,
  pathOrUrl: string,
  signal?: AbortSignal,
): Promise<{ status: number; headers: Record<string, string>; data: unknown }> {
  const response = await http.fetch({
    url: resolveUrl(draft, pathOrUrl),
    method: "GET",
    headers: createHeaders(draft),
    signal,
  })

  return {
    status: response.status,
    headers: response.headers,
    data: parseJsonBody(response),
  }
}

function parseJsonBody(response: HttpResponse): unknown {
  if (response.body === "") {
    return null
  }

  try {
    return JSON.parse(response.body)
  } catch {
    return response.body
  }
}

function extractNextLink(linkHeader: string | undefined): string | null {
  if (!linkHeader) {
    return null
  }

  const parts = linkHeader.split(",")
  for (const part of parts) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/)
    if (match?.[2] === "next") {
      return match[1]
    }
  }

  return null
}

async function fetchPaginatedArray(
  http: HttpPort,
  draft: LmsConnectionDraft,
  initialPath: string,
  signal?: AbortSignal,
  onPage?: (page: number, loaded: number) => void,
): Promise<unknown[]> {
  const items: unknown[] = []
  let nextUrl: string | null = initialPath
  let page = 0

  while (nextUrl) {
    page += 1
    const response = await canvasRequest(http, draft, nextUrl, signal)
    if (response.status < 200 || response.status >= 300) {
      throw new CanvasRequestStatusError(response.status)
    }

    if (Array.isArray(response.data)) {
      items.push(...response.data)
    }

    onPage?.(page, items.length)
    nextUrl = extractNextLink(response.headers.link)
  }

  return items
}

function isCanvasAuthStatusError(error: unknown): boolean {
  return (
    error instanceof CanvasRequestStatusError &&
    (error.status === 401 || error.status === 403)
  )
}

function toCourseSummary(course: unknown): LmsCourseSummary {
  const record = (course ?? {}) as {
    id?: unknown
    name?: unknown
    course_code?: unknown
  }

  return {
    id: String(record.id ?? ""),
    name: typeof record.name === "string" ? record.name : "Untitled Course",
    code: typeof record.course_code === "string" ? record.course_code : null,
  }
}

function toRosterStudentInput(user: unknown) {
  const record = (user ?? {}) as {
    id?: unknown
    sis_user_id?: unknown
    sortable_name?: unknown
    name?: unknown
    short_name?: unknown
    email?: unknown
    login_id?: unknown
  }

  const loginId = typeof record.login_id === "string" ? record.login_id : null
  const email =
    typeof record.email === "string"
      ? record.email
      : loginId?.includes("@")
        ? loginId
        : null

  return {
    id: record.id,
    studentNumber: record.sis_user_id,
    displayNameCandidates: [
      record.sortable_name,
      record.name,
      record.short_name,
    ],
    emailCandidates: [email],
    gitUsername: null,
  }
}

function toGroupSetSummary(groupSet: unknown): LmsGroupSetSummary {
  const record = (groupSet ?? {}) as {
    id?: unknown
    name?: unknown
    group_count?: unknown
    groups_count?: unknown
  }

  const groupCountValue =
    typeof record.group_count === "number"
      ? record.group_count
      : typeof record.groups_count === "number"
        ? record.groups_count
        : 0

  return {
    id: String(record.id ?? ""),
    name: typeof record.name === "string" ? record.name : "Untitled Group Set",
    groupCount: groupCountValue,
  }
}

function toGroup(group: unknown, memberIds: string[]): Group {
  const record = (group ?? {}) as {
    id?: unknown
    name?: unknown
  }

  const lmsGroupId = String(record.id ?? "")

  return {
    id: lmsGroupId,
    name: typeof record.name === "string" ? record.name : "Untitled Group",
    memberIds,
    origin: "lms",
    lmsGroupId,
  }
}

function toGroupMemberIds(memberships: unknown[]): string[] {
  return memberships.flatMap((membership) => {
    const record = membership as { user_id?: unknown }
    if (record.user_id === undefined || record.user_id === null) {
      return []
    }

    return [String(record.user_id)]
  })
}

function parseGroupCategoryId(group: unknown): string | null {
  const record = (group ?? {}) as {
    group_category_id?: unknown
    group_category?: unknown
  }
  const category = (record.group_category ?? {}) as { id?: unknown }

  const candidate = record.group_category_id ?? category.id
  if (candidate === undefined || candidate === null) {
    return null
  }

  return String(candidate)
}

function parseGroupCategoryName(group: unknown, categoryId: string): string {
  const record = (group ?? {}) as { group_category?: unknown }
  const category = (record.group_category ?? {}) as { name?: unknown }
  return typeof category.name === "string"
    ? category.name
    : `Group Set ${categoryId}`
}

function deriveGroupSetSummariesFromCourseGroups(
  groups: unknown[],
): LmsGroupSetSummary[] {
  const byCategoryId = new Map<
    string,
    { id: string; name: string; groupCount: number }
  >()

  for (const group of groups) {
    const categoryId = parseGroupCategoryId(group)
    if (categoryId === null) {
      continue
    }

    const existing = byCategoryId.get(categoryId)
    if (existing) {
      existing.groupCount += 1
      continue
    }

    byCategoryId.set(categoryId, {
      id: categoryId,
      name: parseGroupCategoryName(group, categoryId),
      groupCount: 1,
    })
  }

  return [...byCategoryId.values()]
}

async function fetchGroupSetSummaries(
  http: HttpPort,
  draft: LmsConnectionDraft,
  courseId: string,
  signal?: AbortSignal,
): Promise<LmsGroupSetSummary[]> {
  try {
    const groupSets = await fetchPaginatedArray(
      http,
      draft,
      `/courses/${encodeURIComponent(courseId)}/group_categories?per_page=100`,
      signal,
    )

    return groupSets.map(toGroupSetSummary)
  } catch (error) {
    if (!isCanvasAuthStatusError(error)) {
      throw error
    }

    const groups = await fetchPaginatedArray(
      http,
      draft,
      `/courses/${encodeURIComponent(
        courseId,
      )}/groups?include[]=group_category&per_page=100`,
      signal,
    )
    return deriveGroupSetSummariesFromCourseGroups(groups)
  }
}

async function fetchGroupSetName(
  http: HttpPort,
  draft: LmsConnectionDraft,
  courseId: string,
  groupSetId: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await canvasRequest(
    http,
    draft,
    `/group_categories/${encodeURIComponent(groupSetId)}`,
    signal,
  )

  if (response.status < 200 || response.status >= 300) {
    try {
      const groupSets = await fetchGroupSetSummaries(
        http,
        draft,
        courseId,
        signal,
      )
      const matched = groupSets.find((entry) => entry.id === groupSetId)
      if (matched && matched.name.trim() !== "") {
        return matched.name
      }
    } catch {
      // Fall through to generic fallback name.
    }
    return `Group Set ${groupSetId}`
  }

  const record = (response.data ?? {}) as { name?: unknown }
  return typeof record.name === "string"
    ? record.name
    : `Group Set ${groupSetId}`
}

async function fetchGroupsForSet(
  http: HttpPort,
  draft: LmsConnectionDraft,
  courseId: string,
  groupSetId: string,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<Group[]> {
  let groups: unknown[]
  try {
    groups = await fetchPaginatedArray(
      http,
      draft,
      `/group_categories/${encodeURIComponent(groupSetId)}/groups?per_page=100`,
      signal,
      (page, loaded) => {
        onProgress?.(`Fetched group page ${page} (${loaded} groups loaded)`)
      },
    )
  } catch (error) {
    if (!isCanvasAuthStatusError(error)) {
      throw error
    }

    const courseGroups = await fetchPaginatedArray(
      http,
      draft,
      `/courses/${encodeURIComponent(courseId)}/groups?per_page=100`,
      signal,
      (page, loaded) => {
        onProgress?.(`Fetched group page ${page} (${loaded} groups loaded)`)
      },
    )
    groups = courseGroups.filter(
      (group) => parseGroupCategoryId(group) === groupSetId,
    )
  }

  const result: Group[] = []
  for (const group of groups) {
    const record = group as { id?: unknown; name?: unknown }
    const groupId = String(record.id ?? "")
    const groupName =
      typeof record.name === "string" ? record.name : `Group ${groupId}`
    const memberships = await fetchPaginatedArray(
      http,
      draft,
      `/groups/${encodeURIComponent(groupId)}/memberships?filter_states[]=accepted&per_page=100`,
      signal,
      (_page, loaded) => {
        onProgress?.(
          `Loading members for group ${groupName} (${loaded} loaded)`,
        )
      },
    )

    result.push(toGroup(group, toGroupMemberIds(memberships)))
  }

  return result
}

export function createCanvasClient(http: HttpPort): LmsClient {
  return {
    async verifyConnection(
      draft: LmsConnectionDraft,
      signal?: AbortSignal,
    ): Promise<{ verified: boolean }> {
      try {
        const response = await canvasRequest(http, draft, "/users/self", signal)
        return { verified: response.status >= 200 && response.status < 300 }
      } catch {
        return { verified: false }
      }
    },

    async listCourses(
      draft: LmsConnectionDraft,
      signal?: AbortSignal,
    ): Promise<LmsCourseSummary[]> {
      const courses = await fetchPaginatedArray(
        http,
        draft,
        "/courses?enrollment_type=teacher&per_page=100",
        signal,
      )

      return courses.map(toCourseSummary)
    },

    async fetchRoster(
      draft: LmsConnectionDraft,
      courseId: string,
      signal?: AbortSignal,
    ): Promise<Roster> {
      const students = await fetchPaginatedArray(
        http,
        draft,
        `/courses/${encodeURIComponent(
          courseId,
        )}/users?enrollment_type[]=student&per_page=100`,
        signal,
      )

      return {
        ...normalizeRoster(students.map(toRosterStudentInput)),
        connection: {
          kind: "canvas",
          courseId,
          lastUpdated: new Date().toISOString(),
        },
      }
    },

    async listGroupSets(
      draft: LmsConnectionDraft,
      courseId: string,
      signal?: AbortSignal,
    ): Promise<LmsGroupSetSummary[]> {
      return fetchGroupSetSummaries(http, draft, courseId, signal)
    },

    async fetchGroupSet(
      draft: LmsConnectionDraft,
      courseId: string,
      groupSetId: string,
      signal?: AbortSignal,
      onProgress?: (message: string) => void,
    ): Promise<LmsFetchedGroupSet> {
      const [name, groups] = await Promise.all([
        fetchGroupSetName(http, draft, courseId, groupSetId, signal),
        fetchGroupsForSet(
          http,
          draft,
          courseId,
          groupSetId,
          signal,
          onProgress,
        ),
      ])

      return {
        groupSet: {
          id: groupSetId,
          name,
          groupIds: groups.map((group) => group.id),
          connection: {
            kind: "canvas",
            courseId,
            groupSetId,
            lastUpdated: new Date().toISOString(),
          },
          groupSelection: {
            kind: "all",
            excludedGroupIds: [],
          },
        },
        groups,
      }
    },
  }
}
