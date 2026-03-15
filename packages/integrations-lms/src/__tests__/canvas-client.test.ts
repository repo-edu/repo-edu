import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import type { LmsConnectionDraft } from "@repo-edu/integrations-lms-contract"
import { createCanvasClient } from "../canvas/index.js"

const baseDraft: LmsConnectionDraft = {
  provider: "canvas",
  baseUrl: "https://canvas.example.com",
  token: "canvas-token",
}

type MockRoute = {
  method: string
  urlPattern: string | RegExp
  status: number
  body: unknown
  headers?: Record<string, string>
}

function createMockHttpPort(routes: MockRoute[]): HttpPort {
  return {
    async fetch(request: HttpRequest): Promise<HttpResponse> {
      for (const route of routes) {
        const methodMatch =
          request.method === route.method ||
          (!request.method && route.method === "GET")
        const urlMatch =
          typeof route.urlPattern === "string"
            ? request.url.includes(route.urlPattern)
            : route.urlPattern.test(request.url)

        if (methodMatch && urlMatch) {
          return {
            status: route.status,
            statusText: route.status < 300 ? "OK" : "Error",
            headers: {
              "content-type": "application/json",
              ...(route.headers ?? {}),
            },
            body: JSON.stringify(route.body),
          }
        }
      }

      return {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Not Found" }),
      }
    },
  }
}

describe("createCanvasClient", () => {
  it("verifies the connection via users/self and sends bearer auth", async () => {
    let capturedHeaders: Record<string, string> | undefined
    const http: HttpPort = {
      async fetch(request: HttpRequest): Promise<HttpResponse> {
        capturedHeaders = request.headers
        return {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: 1, name: "Teacher" }),
        }
      },
    }

    const client = createCanvasClient(http)
    const result = await client.verifyConnection(baseDraft)

    assert.deepStrictEqual(result, { verified: true })
    assert.equal(capturedHeaders?.Authorization, "Bearer canvas-token")
    assert.equal(capturedHeaders?.["User-Agent"], "repo-edu")
  })

  it("uses custom user-agent header when provided", async () => {
    let capturedHeaders: Record<string, string> | undefined
    const http: HttpPort = {
      async fetch(request: HttpRequest): Promise<HttpResponse> {
        capturedHeaders = request.headers
        return {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: 1, name: "Teacher" }),
        }
      },
    }

    const client = createCanvasClient(http)
    await client.verifyConnection({
      ...baseDraft,
      userAgent: "Name / Organization / email@example.edu",
    })

    assert.equal(
      capturedHeaders?.["User-Agent"],
      "Name / Organization / email@example.edu",
    )
  })

  it("lists courses across paginated responses", async () => {
    const http = createMockHttpPort([
      {
        method: "GET",
        urlPattern: "/api/v1/courses?enrollment_type=teacher&per_page=100",
        status: 200,
        headers: {
          link: '<https://canvas.example.com/api/v1/courses?page=2>; rel="next"',
        },
        body: [{ id: 1, name: "Algorithms", course_code: "CS101" }],
      },
      {
        method: "GET",
        urlPattern: "/api/v1/courses?page=2",
        status: 200,
        body: [{ id: 2, name: "Databases", course_code: null }],
      },
    ])

    const client = createCanvasClient(http)
    const result = await client.listCourses(baseDraft)

    assert.deepStrictEqual(result, [
      { id: "1", name: "Algorithms", code: "CS101" },
      { id: "2", name: "Databases", code: null },
    ])
  })

  it("fetches and normalizes a roster with students and staff by enrollment type", async () => {
    const http = createMockHttpPort([
      {
        method: "GET",
        urlPattern:
          "/api/v1/courses/course-1/users?enrollment_type[]=student&include[]=enrollments&per_page=100",
        status: 200,
        body: [
          {
            id: 10,
            sis_user_id: "s-10",
            sortable_name: "Lovelace, Ada",
            login_id: "ada@example.com",
            enrollments: [{ enrollment_state: "active" }],
          },
        ],
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/courses/course-1/users?enrollment_type[]=teacher&include[]=enrollments&per_page=100",
        status: 200,
        body: [
          {
            id: 20,
            sis_user_id: null,
            sortable_name: "Turing, Alan",
            login_id: "alan@example.com",
            enrollments: [{ enrollment_state: "active" }],
          },
        ],
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/courses/course-1/users?enrollment_type[]=ta&include[]=enrollments&per_page=100",
        status: 200,
        body: [
          {
            id: 30,
            sis_user_id: null,
            sortable_name: "Hopper, Grace",
            login_id: "grace@example.com",
            enrollments: [{ enrollment_state: "active" }],
          },
        ],
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/courses/course-1/users?enrollment_type[]=designer&include[]=enrollments&per_page=100",
        status: 200,
        body: [],
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/courses/course-1/users?enrollment_type[]=observer&include[]=enrollments&per_page=100",
        status: 200,
        body: [],
      },
    ])

    const client = createCanvasClient(http)
    const result = await client.fetchRoster(baseDraft, "course-1")

    assert.equal(result.students.length, 1)
    assert.equal(result.students[0].enrollmentType, "student")

    assert.equal(result.staff.length, 2)
    assert.equal(result.staff[0].name, "Turing, Alan")
    assert.equal(result.staff[0].enrollmentType, "teacher")
    assert.equal(result.staff[1].name, "Hopper, Grace")
    assert.equal(result.staff[1].enrollmentType, "ta")

    assert.equal(result.connection?.kind, "canvas")
    assert.equal(result.connection?.courseId, "course-1")
    assert.match(result.connection?.lastUpdated ?? "", /^\d{4}-\d{2}-\d{2}T/)
  })

  it("emits detailed progress while fetching a roster", async () => {
    const http = createMockHttpPort([
      {
        method: "GET",
        urlPattern:
          "/api/v1/courses/course-1/users?enrollment_type[]=student&include[]=enrollments&per_page=100",
        status: 200,
        body: [
          {
            id: 10,
            sis_user_id: "s-10",
            sortable_name: "Lovelace, Ada",
            login_id: "ada@example.com",
            enrollments: [{ enrollment_state: "active" }],
          },
        ],
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/courses/course-1/users?enrollment_type[]=teacher&include[]=enrollments&per_page=100",
        status: 200,
        body: [
          {
            id: 20,
            sortable_name: "Turing, Alan",
            login_id: "alan@example.com",
            enrollments: [{ enrollment_state: "active" }],
          },
        ],
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/courses/course-1/users?enrollment_type[]=ta&include[]=enrollments&per_page=100",
        status: 200,
        body: [],
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/courses/course-1/users?enrollment_type[]=designer&include[]=enrollments&per_page=100",
        status: 200,
        body: [],
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/courses/course-1/users?enrollment_type[]=observer&include[]=enrollments&per_page=100",
        status: 200,
        body: [],
      },
    ])

    const progress: string[] = []
    const client = createCanvasClient(http)
    await client.fetchRoster(baseDraft, "course-1", undefined, (message) => {
      progress.push(message)
    })

    assert.equal(
      progress.includes("Loading students from LMS (page 1, 1 loaded)"),
      true,
    )
    assert.equal(
      progress.includes("Loading teachers from LMS (page 1, 1 loaded)"),
      true,
    )
    assert.equal(
      progress.includes("Loaded 1 students and 1 staff from LMS."),
      true,
    )
  })

  it("lists group sets for a course", async () => {
    const http = createMockHttpPort([
      {
        method: "GET",
        urlPattern: "/api/v1/courses/course-1/group_categories?per_page=100",
        status: 200,
        body: [{ id: 55, name: "Project Teams", groups_count: 3 }],
      },
    ])

    const client = createCanvasClient(http)
    const result = await client.listGroupSets(baseDraft, "course-1")

    assert.deepStrictEqual(result, [
      { id: "55", name: "Project Teams", groupCount: 3 },
    ])
  })

  it("falls back to course groups when group categories endpoint is forbidden", async () => {
    const http = createMockHttpPort([
      {
        method: "GET",
        urlPattern:
          /\/api\/v1\/courses\/course-1\/group_categories\?per_page=100$/,
        status: 403,
        body: { errors: [{ message: "Forbidden" }] },
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/courses/course-1/groups?include[]=group_category&per_page=100",
        status: 200,
        body: [
          {
            id: 11,
            name: "A",
            group_category_id: 55,
            group_category: { id: 55, name: "Project Teams" },
          },
          {
            id: 12,
            name: "B",
            group_category_id: 55,
            group_category: { id: 55, name: "Project Teams" },
          },
          {
            id: 13,
            name: "C",
            group_category_id: 77,
            group_category: { id: 77, name: "Lab Groups" },
          },
        ],
      },
    ])

    const client = createCanvasClient(http)
    const result = await client.listGroupSets(baseDraft, "course-1")

    assert.deepStrictEqual(result, [
      { id: "55", name: "Project Teams", groupCount: 2 },
      { id: "77", name: "Lab Groups", groupCount: 1 },
    ])
  })

  it("fetches a full group set with members", async () => {
    const http = createMockHttpPort([
      {
        method: "GET",
        urlPattern: /\/api\/v1\/group_categories\/group-set-1$/,
        status: 200,
        body: { id: 99, name: "Lab Groups" },
      },
      {
        method: "GET",
        urlPattern:
          /\/api\/v1\/group_categories\/group-set-1\/groups\?per_page=100$/,
        status: 200,
        body: [{ id: 201, name: "Group A" }],
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/groups/201/memberships?filter_states[]=accepted&per_page=100",
        status: 200,
        body: [{ user_id: 10 }, { user_id: 11 }],
      },
    ])

    const client = createCanvasClient(http)
    const result = await client.fetchGroupSet(
      baseDraft,
      "course-1",
      "group-set-1",
    )

    assert.deepStrictEqual(result.groups, [
      {
        id: "201",
        name: "Group A",
        memberIds: ["10", "11"],
        origin: "lms",
        lmsGroupId: "201",
      },
    ])
    assert.deepStrictEqual(result.groupSet, {
      id: "group-set-1",
      name: "Lab Groups",
      groupIds: ["201"],
      connection: {
        kind: "canvas",
        courseId: "course-1",
        groupSetId: "group-set-1",
        lastUpdated:
          result.groupSet.connection?.kind === "canvas"
            ? result.groupSet.connection.lastUpdated
            : "",
      },
      groupSelection: {
        kind: "all",
        excludedGroupIds: [],
      },
      repoNameTemplate: null,
    })
    assert.equal(result.groupSet.connection?.kind, "canvas")
    assert.equal(result.groupSet.connection?.courseId, "course-1")
    assert.equal(result.groupSet.connection?.groupSetId, "group-set-1")
    assert.match(
      result.groupSet.connection?.lastUpdated ?? "",
      /^\d{4}-\d{2}-\d{2}T/,
    )
  })

  it("emits detailed progress while fetching a group set", async () => {
    const http = createMockHttpPort([
      {
        method: "GET",
        urlPattern: /\/api\/v1\/group_categories\/group-set-1$/,
        status: 200,
        body: { id: 99, name: "Lab Groups" },
      },
      {
        method: "GET",
        urlPattern:
          /\/api\/v1\/group_categories\/group-set-1\/groups\?per_page=100$/,
        status: 200,
        body: [{ id: 201, name: "Group A" }],
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/groups/201/memberships?filter_states[]=accepted&per_page=100",
        status: 200,
        body: [{ user_id: 10 }, { user_id: 11 }],
      },
    ])

    const progress: string[] = []
    const client = createCanvasClient(http)
    await client.fetchGroupSet(
      baseDraft,
      "course-1",
      "group-set-1",
      undefined,
      (message) => {
        progress.push(message)
      },
    )

    assert.equal(
      progress.includes("Fetched group page 1 (1 groups loaded)"),
      true,
    )
    assert.equal(
      progress.includes("Loading members for group Group A (2 loaded)"),
      true,
    )
  })

  it("falls back to course groups when group set groups endpoint is forbidden", async () => {
    const http = createMockHttpPort([
      {
        method: "GET",
        urlPattern: /\/api\/v1\/group_categories\/group-set-1$/,
        status: 200,
        body: { id: 99, name: "Lab Groups" },
      },
      {
        method: "GET",
        urlPattern:
          /\/api\/v1\/group_categories\/group-set-1\/groups\?per_page=100$/,
        status: 403,
        body: { errors: [{ message: "Forbidden" }] },
      },
      {
        method: "GET",
        urlPattern: "/api/v1/courses/course-1/groups?per_page=100",
        status: 200,
        body: [
          { id: 201, name: "Group A", group_category_id: "group-set-1" },
          { id: 301, name: "Group B", group_category_id: "group-set-2" },
        ],
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/groups/201/memberships?filter_states[]=accepted&per_page=100",
        status: 200,
        body: [{ user_id: 10 }],
      },
    ])

    const client = createCanvasClient(http)
    const result = await client.fetchGroupSet(
      baseDraft,
      "course-1",
      "group-set-1",
    )

    assert.deepStrictEqual(result.groups, [
      {
        id: "201",
        name: "Group A",
        memberIds: ["10"],
        origin: "lms",
        lmsGroupId: "201",
      },
    ])
    assert.deepStrictEqual(result.groupSet.groupIds, ["201"])
  })

  it("resolves group set name from fallback summaries when direct name endpoint is forbidden", async () => {
    const http = createMockHttpPort([
      {
        method: "GET",
        urlPattern: /\/api\/v1\/group_categories\/group-set-1$/,
        status: 403,
        body: { errors: [{ message: "Forbidden" }] },
      },
      {
        method: "GET",
        urlPattern:
          /\/api\/v1\/courses\/course-1\/group_categories\?per_page=100$/,
        status: 403,
        body: { errors: [{ message: "Forbidden" }] },
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/courses/course-1/groups?include[]=group_category&per_page=100",
        status: 200,
        body: [
          {
            id: 201,
            name: "Group A",
            group_category_id: "group-set-1",
            group_category: { id: "group-set-1", name: "Project Groups" },
          },
        ],
      },
      {
        method: "GET",
        urlPattern:
          /\/api\/v1\/group_categories\/group-set-1\/groups\?per_page=100$/,
        status: 200,
        body: [{ id: 201, name: "Group A" }],
      },
      {
        method: "GET",
        urlPattern:
          "/api/v1/groups/201/memberships?filter_states[]=accepted&per_page=100",
        status: 200,
        body: [{ user_id: 10 }],
      },
    ])

    const client = createCanvasClient(http)
    const result = await client.fetchGroupSet(
      baseDraft,
      "course-1",
      "group-set-1",
    )

    assert.equal(result.groupSet.name, "Project Groups")
  })
})
