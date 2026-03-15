import type {
  Group,
  Roster,
  RosterMemberNormalizationInput,
} from "@repo-edu/domain"
import { normalizeRoster } from "@repo-edu/domain"
import type { HttpPort, HttpResponse } from "@repo-edu/host-runtime-contract"
import type {
  LmsClient,
  LmsConnectionDraft,
  LmsCourseSummary,
  LmsFetchedGroupSet,
  LmsGroupSetSummary,
} from "@repo-edu/integrations-lms-contract"

type MoodleFunction =
  | "core_webservice_get_site_info"
  | "core_course_get_courses"
  | "core_enrol_get_enrolled_users"
  | "core_group_get_course_groupings"
  | "core_group_get_course_groups"

const DEFAULT_USER_AGENT = "repo-edu"

function resolveEndpoint(draft: LmsConnectionDraft): string {
  const base = draft.baseUrl.replace(/\/+$/, "")
  return base.endsWith("/webservice/rest/server.php")
    ? base
    : `${base}/webservice/rest/server.php`
}

function buildMoodleUrl(
  draft: LmsConnectionDraft,
  fn: MoodleFunction,
  params: Record<string, string>,
): string {
  const search = new URLSearchParams({
    wstoken: draft.token,
    moodlewsrestformat: "json",
    wsfunction: fn,
    ...params,
  })

  return `${resolveEndpoint(draft)}?${search.toString()}`
}

function parseResponseBody(response: HttpResponse): unknown {
  if (response.body === "") {
    return null
  }

  try {
    return JSON.parse(response.body)
  } catch {
    return response.body
  }
}

function isMoodleException(data: unknown): boolean {
  if (typeof data !== "object" || data === null) {
    return false
  }

  return typeof (data as { exception?: unknown }).exception === "string"
}

async function moodleRequest(
  http: HttpPort,
  draft: LmsConnectionDraft,
  fn: MoodleFunction,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  const userAgent = draft.userAgent?.trim() || DEFAULT_USER_AGENT
  const response = await http.fetch({
    url: buildMoodleUrl(draft, fn, params),
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent,
    },
    signal,
  })

  const data = parseResponseBody(response)
  if (
    response.status < 200 ||
    response.status >= 300 ||
    isMoodleException(data)
  ) {
    throw new Error(`Moodle request failed for ${fn}.`)
  }

  return data
}

function toCourseSummary(course: unknown): LmsCourseSummary {
  const record = (course ?? {}) as {
    id?: unknown
    fullname?: unknown
    shortname?: unknown
  }

  return {
    id: String(record.id ?? ""),
    name:
      typeof record.fullname === "string" ? record.fullname : "Untitled Course",
    code: typeof record.shortname === "string" ? record.shortname : null,
  }
}

const MOODLE_ROLE_TO_ENROLLMENT: Record<string, string> = {
  editingteacher: "teacher",
  teacher: "teacher",
  manager: "designer",
  coursecreator: "designer",
}

function moodleStaffEnrollmentType(user: unknown): string | null {
  const record = (user ?? {}) as { roles?: unknown }
  if (!Array.isArray(record.roles)) {
    return null
  }
  for (const role of record.roles) {
    const r = role as { shortname?: unknown }
    if (
      typeof r.shortname === "string" &&
      r.shortname in MOODLE_ROLE_TO_ENROLLMENT
    ) {
      return MOODLE_ROLE_TO_ENROLLMENT[r.shortname]
    }
  }
  return null
}

function toRosterMemberInput(user: unknown): RosterMemberNormalizationInput {
  const record = (user ?? {}) as {
    id?: unknown
    idnumber?: unknown
    fullname?: unknown
    firstname?: unknown
    lastname?: unknown
    email?: unknown
    username?: unknown
  }

  const fullName =
    typeof record.fullname === "string"
      ? record.fullname
      : [record.firstname, record.lastname]
          .filter((value) => typeof value === "string" && value.length > 0)
          .join(" ")

  return {
    id: record.id,
    lmsUserId: record.id,
    source: "moodle",
    studentNumber: record.idnumber,
    displayNameCandidates: [record.fullname, fullName],
    emailCandidates: [record.email],
    gitUsername: null,
  }
}

function toGroupSetSummary(grouping: unknown): LmsGroupSetSummary {
  const record = (grouping ?? {}) as {
    id?: unknown
    name?: unknown
    groupcount?: unknown
  }

  return {
    id: String(record.id ?? ""),
    name: typeof record.name === "string" ? record.name : "Untitled Group Set",
    groupCount: typeof record.groupcount === "number" ? record.groupcount : 0,
  }
}

function isGroupInGrouping(group: unknown, groupSetId: string): boolean {
  const record = (group ?? {}) as {
    groupingid?: unknown
    groupingids?: unknown
  }

  if (String(record.groupingid ?? "") === groupSetId) {
    return true
  }

  if (Array.isArray(record.groupingids)) {
    return record.groupingids.some((value) => String(value) === groupSetId)
  }

  return false
}

function toGroupMemberIds(members: unknown): string[] {
  if (!Array.isArray(members)) {
    return []
  }

  return members.flatMap((member) => {
    const record = member as { userid?: unknown; id?: unknown }
    const studentId = record.userid ?? record.id
    if (studentId === undefined || studentId === null) {
      return []
    }

    return [String(studentId)]
  })
}

function toGroup(group: unknown): Group {
  const record = (group ?? {}) as {
    id?: unknown
    name?: unknown
    members?: unknown
  }

  const lmsGroupId = String(record.id ?? "")

  return {
    id: lmsGroupId,
    name: typeof record.name === "string" ? record.name : "Untitled Group",
    memberIds: toGroupMemberIds(record.members),
    origin: "lms",
    lmsGroupId,
  }
}

export function createMoodleClient(http: HttpPort): LmsClient {
  return {
    async verifyConnection(
      draft: LmsConnectionDraft,
      signal?: AbortSignal,
    ): Promise<{ verified: boolean }> {
      try {
        await moodleRequest(
          http,
          draft,
          "core_webservice_get_site_info",
          {},
          signal,
        )
        return { verified: true }
      } catch {
        return { verified: false }
      }
    },

    async listCourses(
      draft: LmsConnectionDraft,
      signal?: AbortSignal,
    ): Promise<LmsCourseSummary[]> {
      const data = await moodleRequest(
        http,
        draft,
        "core_course_get_courses",
        {},
        signal,
      )

      if (!Array.isArray(data)) {
        return []
      }

      return data.map(toCourseSummary)
    },

    async fetchRoster(
      draft: LmsConnectionDraft,
      courseId: string,
      signal?: AbortSignal,
      onProgress?: (message: string) => void,
    ): Promise<Roster> {
      onProgress?.("Fetching enrolled users from LMS.")
      const data = await moodleRequest(
        http,
        draft,
        "core_enrol_get_enrolled_users",
        { courseid: courseId },
        signal,
      )

      if (!Array.isArray(data)) {
        onProgress?.("Loaded 0 enrolled users from LMS.")
        return {
          ...normalizeRoster([]),
          connection: {
            kind: "moodle",
            courseId,
            lastUpdated: new Date().toISOString(),
          },
        }
      }

      const staffInputs: ReturnType<typeof toRosterMemberInput>[] = []
      const studentInputs: ReturnType<typeof toRosterMemberInput>[] = []
      for (const user of data) {
        const staffType = moodleStaffEnrollmentType(user)
        if (staffType !== null) {
          staffInputs.push({
            ...toRosterMemberInput(user),
            enrollmentType: staffType,
          })
        } else {
          studentInputs.push(toRosterMemberInput(user))
        }
      }
      onProgress?.(`Loaded ${data.length} enrolled users from LMS.`)

      return {
        ...normalizeRoster(studentInputs, staffInputs),
        connection: {
          kind: "moodle",
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
      const data = await moodleRequest(
        http,
        draft,
        "core_group_get_course_groupings",
        { courseid: courseId },
        signal,
      )

      if (!Array.isArray(data)) {
        return []
      }

      return data.map(toGroupSetSummary)
    },

    async fetchGroupSet(
      draft: LmsConnectionDraft,
      courseId: string,
      groupSetId: string,
      signal?: AbortSignal,
      onProgress?: (message: string) => void,
    ): Promise<LmsFetchedGroupSet> {
      onProgress?.("Fetching LMS group set data.")
      const [groupings, groups] = await Promise.all([
        moodleRequest(
          http,
          draft,
          "core_group_get_course_groupings",
          { courseid: courseId },
          signal,
        ),
        moodleRequest(
          http,
          draft,
          "core_group_get_course_groups",
          { courseid: courseId },
          signal,
        ),
      ])

      const groupingList = Array.isArray(groupings) ? groupings : []
      const groupList = Array.isArray(groups) ? groups : []
      const matchedGroups = groupList
        .filter((group) => isGroupInGrouping(group, groupSetId))
        .map(toGroup)
      onProgress?.(`Loaded ${matchedGroups.length} groups from LMS.`)
      const grouping = groupingList.find(
        (item) => String((item as { id?: unknown }).id ?? "") === groupSetId,
      ) as { name?: unknown } | undefined

      return {
        groupSet: {
          id: groupSetId,
          name:
            typeof grouping?.name === "string"
              ? grouping.name
              : `Group Set ${groupSetId}`,
          groupIds: matchedGroups.map((group) => group.id),
          connection: {
            kind: "moodle",
            courseId,
            groupingId: groupSetId,
            lastUpdated: new Date().toISOString(),
          },
          groupSelection: {
            kind: "all",
            excludedGroupIds: [],
          },
          repoNameTemplate: null,
        },
        groups: matchedGroups,
      }
    },
  }
}
