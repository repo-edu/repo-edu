import type { Group, Roster } from "@repo-edu/domain";
import { normalizeRoster } from "@repo-edu/domain";
import type { HttpPort, HttpResponse } from "@repo-edu/host-runtime-contract";
import type {
  LmsClient,
  LmsConnectionDraft,
  LmsCourseSummary,
  LmsFetchedGroupSet,
  LmsGroupSetSummary,
} from "@repo-edu/integrations-lms-contract";

function resolveApiBase(draft: LmsConnectionDraft): string {
  const base = draft.baseUrl.replace(/\/+$/, "");
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
}

function createHeaders(draft: LmsConnectionDraft): Record<string, string> {
  return {
    Authorization: `Bearer ${draft.token}`,
    Accept: "application/json",
  };
}

function resolveUrl(draft: LmsConnectionDraft, pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return `${resolveApiBase(draft)}${pathOrUrl}`;
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
  });

  return {
    status: response.status,
    headers: response.headers,
    data: parseJsonBody(response),
  };
}

function parseJsonBody(response: HttpResponse): unknown {
  if (response.body === "") {
    return null;
  }

  try {
    return JSON.parse(response.body);
  } catch {
    return response.body;
  }
}

function extractNextLink(linkHeader: string | undefined): string | null {
  if (!linkHeader) {
    return null;
  }

  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (match?.[2] === "next") {
      return match[1];
    }
  }

  return null;
}

async function fetchPaginatedArray(
  http: HttpPort,
  draft: LmsConnectionDraft,
  initialPath: string,
  signal?: AbortSignal,
): Promise<unknown[]> {
  const items: unknown[] = [];
  let nextUrl: string | null = initialPath;

  while (nextUrl) {
    const response = await canvasRequest(http, draft, nextUrl, signal);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Canvas request failed with status ${response.status}.`);
    }

    if (Array.isArray(response.data)) {
      items.push(...response.data);
    }

    nextUrl = extractNextLink(response.headers.link);
  }

  return items;
}

function toCourseSummary(course: unknown): LmsCourseSummary {
  const record = (course ?? {}) as {
    id?: unknown;
    name?: unknown;
    course_code?: unknown;
  };

  return {
    id: String(record.id ?? ""),
    name: typeof record.name === "string" ? record.name : "Untitled Course",
    code: typeof record.course_code === "string" ? record.course_code : null,
  };
}

function toRosterStudentInput(user: unknown) {
  const record = (user ?? {}) as {
    id?: unknown;
    sis_user_id?: unknown;
    sortable_name?: unknown;
    name?: unknown;
    short_name?: unknown;
    email?: unknown;
    login_id?: unknown;
  };

  const loginId = typeof record.login_id === "string" ? record.login_id : null;
  const email =
    typeof record.email === "string"
      ? record.email
      : loginId?.includes("@")
        ? loginId
        : null;

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
  };
}

function toGroupSetSummary(groupSet: unknown): LmsGroupSetSummary {
  const record = (groupSet ?? {}) as {
    id?: unknown;
    name?: unknown;
    group_count?: unknown;
    groups_count?: unknown;
  };

  const groupCountValue =
    typeof record.group_count === "number"
      ? record.group_count
      : typeof record.groups_count === "number"
        ? record.groups_count
        : 0;

  return {
    id: String(record.id ?? ""),
    name: typeof record.name === "string" ? record.name : "Untitled Group Set",
    groupCount: groupCountValue,
  };
}

function toGroup(group: unknown, memberIds: string[]): Group {
  const record = (group ?? {}) as {
    id?: unknown;
    name?: unknown;
  };

  const lmsGroupId = String(record.id ?? "");

  return {
    id: lmsGroupId,
    name: typeof record.name === "string" ? record.name : "Untitled Group",
    memberIds,
    origin: "lms",
    lmsGroupId,
  };
}

function toGroupMemberIds(memberships: unknown[]): string[] {
  return memberships.flatMap((membership) => {
    const record = membership as { user_id?: unknown };
    if (record.user_id === undefined || record.user_id === null) {
      return [];
    }

    return [String(record.user_id)];
  });
}

async function fetchGroupSetName(
  http: HttpPort,
  draft: LmsConnectionDraft,
  groupSetId: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await canvasRequest(
    http,
    draft,
    `/group_categories/${encodeURIComponent(groupSetId)}`,
    signal,
  );

  if (response.status < 200 || response.status >= 300) {
    return `Group Set ${groupSetId}`;
  }

  const record = (response.data ?? {}) as { name?: unknown };
  return typeof record.name === "string"
    ? record.name
    : `Group Set ${groupSetId}`;
}

async function fetchGroupsForSet(
  http: HttpPort,
  draft: LmsConnectionDraft,
  groupSetId: string,
  signal?: AbortSignal,
): Promise<Group[]> {
  const groups = await fetchPaginatedArray(
    http,
    draft,
    `/group_categories/${encodeURIComponent(groupSetId)}/groups?per_page=100`,
    signal,
  );

  const result: Group[] = [];
  for (const group of groups) {
    const groupId = String((group as { id?: unknown }).id ?? "");
    const memberships = await fetchPaginatedArray(
      http,
      draft,
      `/groups/${encodeURIComponent(groupId)}/memberships?filter_states[]=accepted&per_page=100`,
      signal,
    );

    result.push(toGroup(group, toGroupMemberIds(memberships)));
  }

  return result;
}

export function createCanvasClient(http: HttpPort): LmsClient {
  return {
    async verifyConnection(
      draft: LmsConnectionDraft,
      signal?: AbortSignal,
    ): Promise<{ verified: boolean }> {
      try {
        const response = await canvasRequest(
          http,
          draft,
          "/users/self",
          signal,
        );
        return { verified: response.status >= 200 && response.status < 300 };
      } catch {
        return { verified: false };
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
      );

      return courses.map(toCourseSummary);
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
      );

      return {
        ...normalizeRoster(students.map(toRosterStudentInput)),
        connection: {
          kind: "canvas",
          courseId,
          lastUpdated: new Date().toISOString(),
        },
      };
    },

    async listGroupSets(
      draft: LmsConnectionDraft,
      courseId: string,
      signal?: AbortSignal,
    ): Promise<LmsGroupSetSummary[]> {
      const groupSets = await fetchPaginatedArray(
        http,
        draft,
        `/courses/${encodeURIComponent(courseId)}/group_categories?per_page=100`,
        signal,
      );

      return groupSets.map(toGroupSetSummary);
    },

    async fetchGroupSet(
      draft: LmsConnectionDraft,
      courseId: string,
      groupSetId: string,
      signal?: AbortSignal,
    ): Promise<LmsFetchedGroupSet> {
      const [name, groups] = await Promise.all([
        fetchGroupSetName(http, draft, groupSetId, signal),
        fetchGroupsForSet(http, draft, groupSetId, signal),
      ]);

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
      };
    },
  };
}
