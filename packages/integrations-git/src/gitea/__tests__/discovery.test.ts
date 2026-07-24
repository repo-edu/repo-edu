import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { HttpPort, HttpResponse } from "@repo-edu/host-runtime-contract"
import { createGiteaClient } from "../gitea-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

describe("gitea discovery", () => {
  describe("listRepositories", () => {
    it("lists org repositories with glob filter and excludes archived by default", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/api\/v1\/orgs\/course-org\/repos\?limit=50&page=1/,
          status: 200,
          body: [
            { name: "lab1-alice-bob", archived: false },
            { name: "lab1-charlie", archived: false },
            { name: "lab2-dave", archived: false },
            { name: "lab1-archived", archived: true },
          ],
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.listRepositories(baseDraft, {
        namespace: "course-org",
        filter: "lab1-*",
      })

      assert.deepStrictEqual(
        result.repositories.map((entry) => entry.name).sort(),
        ["lab1-alice-bob", "lab1-charlie"],
      )
    })

    it("includes archived repositories when includeArchived is true", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/api\/v1\/orgs\/course-org\/repos/,
          status: 200,
          body: [
            { name: "repo-a", archived: false },
            { name: "repo-b", archived: true },
          ],
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.listRepositories(baseDraft, {
        namespace: "course-org",
        includeArchived: true,
      })

      assert.deepStrictEqual(
        result.repositories.map((entry) => ({
          name: entry.name,
          archived: entry.archived,
        })),
        [
          { name: "repo-a", archived: false },
          { name: "repo-b", archived: true },
        ],
      )
    })

    it("falls back to the /users endpoint when /orgs returns 404", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/api\/v1\/orgs\/alice\/repos/,
          status: 404,
          body: { message: "Not Found" },
        },
        {
          method: "GET",
          urlPattern: /\/api\/v1\/users\/alice\/repos/,
          status: 200,
          body: [{ name: "personal-repo", archived: false }],
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.listRepositories(baseDraft, {
        namespace: "alice",
      })

      assert.deepStrictEqual(
        result.repositories.map((entry) => entry.name),
        ["personal-repo"],
      )
    })

    it("returns an empty list when neither organization nor user namespace exists", async () => {
      const client = createGiteaClient(createMockHttpPort([]))
      const result = await client.listRepositories(baseDraft, {
        namespace: "ghost",
      })

      assert.deepStrictEqual(result.repositories, [])
    })

    it("propagates provider failures instead of returning an empty listing", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/api\/v1\/orgs\/course-org\/repos/,
          status: 500,
          body: { message: "internal error" },
        },
      ])

      const client = createGiteaClient(http)
      await assert.rejects(
        client.listRepositories(baseDraft, { namespace: "course-org" }),
        /Failed to list repositories for 'course-org' \(500\)\./,
      )
    })

    it("propagates network failures instead of returning an empty listing", async () => {
      const failure = new Error("Connection refused")
      const http: HttpPort = {
        async fetch(): Promise<HttpResponse> {
          throw failure
        },
      }

      const client = createGiteaClient(http)
      await assert.rejects(
        client.listRepositories(baseDraft, { namespace: "course-org" }),
        failure,
      )
    })

    it("returns an empty list when baseUrl is missing", async () => {
      const client = createGiteaClient(createMockHttpPort([]))
      const result = await client.listRepositories(
        { ...baseDraft, baseUrl: "" },
        { namespace: "course-org" },
      )

      assert.deepStrictEqual(result.repositories, [])
    })
  })
})
