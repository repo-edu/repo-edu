import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createGitHubClient } from "../github-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

describe("github discovery", () => {
  describe("listRepositories", () => {
    it("lists org repositories with glob filter and excludes archived by default", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/orgs\/test-org\/repos/,
          status: 200,
          body: [
            { name: "lab1-alice", archived: false },
            { name: "lab1-bob", archived: false },
            { name: "lab2-carol", archived: false },
            { name: "lab1-archived", archived: true },
          ],
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.listRepositories(baseDraft, {
        namespace: "test-org",
        filter: "lab1-*",
      })

      assert.deepStrictEqual(
        result.repositories.map((entry) => entry.name).sort(),
        ["lab1-alice", "lab1-bob"],
      )
    })

    it("returns archived entries when includeArchived is true", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/orgs\/test-org\/repos/,
          status: 200,
          body: [
            { name: "active-repo", archived: false },
            { name: "stale-repo", archived: true },
          ],
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.listRepositories(baseDraft, {
        namespace: "test-org",
        includeArchived: true,
      })

      assert.deepStrictEqual(
        result.repositories
          .map((entry) => ({ name: entry.name, archived: entry.archived }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        [
          { name: "active-repo", archived: false },
          { name: "stale-repo", archived: true },
        ],
      )
    })

    it("falls back to the /users endpoint when /orgs returns 404", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/orgs\/alice\/repos/,
          status: 404,
          body: { message: "Not Found" },
        },
        {
          method: "GET",
          urlPattern: /\/users\/alice\/repos/,
          status: 200,
          body: [{ name: "personal-project", archived: false }],
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.listRepositories(baseDraft, {
        namespace: "alice",
      })

      assert.deepStrictEqual(
        result.repositories.map((entry) => entry.name),
        ["personal-project"],
      )
    })
  })
})
