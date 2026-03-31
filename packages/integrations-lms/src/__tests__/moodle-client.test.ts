import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import type { LmsConnectionDraft } from "@repo-edu/integrations-lms-contract"
import { createMoodleClient } from "../moodle/index.js"

const baseDraft: LmsConnectionDraft = {
  provider: "moodle",
  baseUrl: "https://moodle.example.com",
  token: "moodle-token",
}

type MockRoute = {
  urlPattern: string | RegExp
  status: number
  body: unknown
}

function createMockHttpPort(routes: MockRoute[]): HttpPort {
  return {
    async fetch(request: HttpRequest): Promise<HttpResponse> {
      for (const route of routes) {
        const urlMatch =
          typeof route.urlPattern === "string"
            ? request.url.includes(route.urlPattern)
            : route.urlPattern.test(request.url)

        if (urlMatch) {
          return {
            status: route.status,
            statusText: route.status < 300 ? "OK" : "Error",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(route.body),
          }
        }
      }

      return {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exception: "not_found" }),
      }
    },
  }
}

describe("createMoodleClient", () => {
  it("verifies connection through core_webservice_get_site_info", async () => {
    let capturedUrl = ""
    let capturedHeaders: Record<string, string> | undefined
    const http: HttpPort = {
      async fetch(request: HttpRequest): Promise<HttpResponse> {
        capturedUrl = request.url
        capturedHeaders = request.headers
        return {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sitename: "Example Moodle" }),
        }
      },
    }

    const client = createMoodleClient(http)
    const result = await client.verifyConnection(baseDraft)

    assert.deepStrictEqual(result, { verified: true })
    assert.ok(capturedUrl.includes("wsfunction=core_webservice_get_site_info"))
    assert.ok(capturedUrl.includes("wstoken=moodle-token"))
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
          body: JSON.stringify({ sitename: "Example Moodle" }),
        }
      },
    }

    const client = createMoodleClient(http)
    await client.verifyConnection({
      ...baseDraft,
      userAgent: "Name / Organization / email@example.edu",
    })

    assert.equal(
      capturedHeaders?.["User-Agent"],
      "Name / Organization / email@example.edu",
    )
  })

  it("lists courses", async () => {
    const http = createMockHttpPort([
      {
        urlPattern: "wsfunction=core_course_get_courses",
        status: 200,
        body: [
          { id: 7, fullname: "Software Testing", shortname: "TEST101" },
          { id: 8, fullname: "Distributed Systems", shortname: null },
        ],
      },
    ])

    const client = createMoodleClient(http)
    const result = await client.listCourses(baseDraft)

    assert.deepStrictEqual(result, [
      { id: "7", name: "Software Testing", code: "TEST101" },
      { id: "8", name: "Distributed Systems", code: null },
    ])
  })

  it("fetches and normalizes a roster with students and staff by role", async () => {
    const http = createMockHttpPort([
      {
        urlPattern: "wsfunction=core_enrol_get_enrolled_users",
        status: 200,
        body: [
          {
            id: 11,
            idnumber: "s-11",
            fullname: "Ada Lovelace",
            email: "ada@example.com",
            roles: [{ shortname: "student" }],
          },
          {
            id: 20,
            idnumber: null,
            fullname: "Alan Turing",
            email: "alan@example.com",
            roles: [{ shortname: "editingteacher" }],
          },
          {
            id: 30,
            idnumber: null,
            fullname: "Grace Hopper",
            email: "grace@example.com",
            roles: [{ shortname: "manager" }],
          },
        ],
      },
    ])

    const client = createMoodleClient(http)
    const result = await client.fetchRoster(baseDraft, "course-1")

    const students = result.filter(
      (member) => member.enrollmentType === "student",
    )
    const staff = result.filter((member) => member.enrollmentType !== "student")
    assert.equal(students.length, 1)
    assert.equal(students[0]?.enrollmentType, "student")

    assert.equal(staff.length, 2)
    assert.equal(staff[0]?.name, "Alan Turing")
    assert.equal(staff[0]?.enrollmentType, "teacher")
    assert.equal(staff[1]?.name, "Grace Hopper")
    assert.equal(staff[1]?.enrollmentType, "designer")
  })

  it("emits progress while fetching a roster", async () => {
    const http = createMockHttpPort([
      {
        urlPattern: "wsfunction=core_enrol_get_enrolled_users",
        status: 200,
        body: [
          {
            id: 11,
            idnumber: "s-11",
            fullname: "Ada Lovelace",
            email: "ada@example.com",
            roles: [{ shortname: "student" }],
          },
          {
            id: 20,
            fullname: "Alan Turing",
            email: "alan@example.com",
            roles: [{ shortname: "editingteacher" }],
          },
        ],
      },
    ])

    const progress: string[] = []
    const client = createMoodleClient(http)
    await client.fetchRoster(baseDraft, "course-1", undefined, (message) => {
      progress.push(message)
    })

    assert.equal(progress.includes("Fetching enrolled users from LMS."), true)
    assert.equal(progress.includes("Loaded 2 enrolled users from LMS."), true)
  })

  it("lists group sets", async () => {
    const http = createMockHttpPort([
      {
        urlPattern: "wsfunction=core_group_get_course_groupings",
        status: 200,
        body: [{ id: 30, name: "Lab Sections", groupcount: 2 }],
      },
    ])

    const client = createMoodleClient(http)
    const result = await client.listGroupSets(baseDraft, "course-1")

    assert.deepStrictEqual(result, [
      { id: "30", name: "Lab Sections", groupCount: 2 },
    ])
  })

  it("fetches a full group set", async () => {
    const http = createMockHttpPort([
      {
        urlPattern: /wsfunction=core_group_get_course_groupings/,
        status: 200,
        body: [{ id: 30, name: "Lab Sections", groupcount: 2 }],
      },
      {
        urlPattern: /wsfunction=core_group_get_course_groups/,
        status: 200,
        body: [
          {
            id: 101,
            name: "Section A",
            groupingid: 30,
            members: [{ userid: 11 }, { userid: 12 }],
          },
          {
            id: 102,
            name: "Section B",
            groupingids: [30],
            members: [{ userid: 13 }],
          },
          {
            id: 103,
            name: "Other Set Group",
            groupingid: 31,
            members: [{ userid: 14 }],
          },
        ],
      },
    ])

    const client = createMoodleClient(http)
    const result = await client.fetchGroupSet(baseDraft, "course-1", "30")

    assert.deepStrictEqual(result.groups, [
      {
        id: "101",
        name: "Section A",
        memberLmsUserIds: ["11", "12"],
      },
      {
        id: "102",
        name: "Section B",
        memberLmsUserIds: ["13"],
      },
    ])
    assert.deepStrictEqual(result.groupSet, {
      id: "30",
      name: "Lab Sections",
    })
  })
})
