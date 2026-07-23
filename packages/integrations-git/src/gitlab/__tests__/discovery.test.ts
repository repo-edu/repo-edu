import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createGitLabClient } from "../gitlab-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

describe("gitlab discovery", () => {
  describe("listRepositories", () => {
    it("lists group projects with glob filter and excludes archived by default", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/groups/my-group",
          status: 200,
          body: { id: 42 },
        },
        {
          method: "GET",
          urlPattern: /\/groups\/42\/projects/,
          status: 200,
          body: [
            { path: "lab1-alice", archived: false },
            { path: "lab1-bob", archived: false },
            { path: "lab2-carol", archived: false },
            { path: "lab1-stale", archived: true },
          ],
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.listRepositories(baseDraft, {
        namespace: "my-group",
        filter: "lab1-*",
      })

      assert.deepStrictEqual(
        result.repositories.map((entry) => entry.name).sort(),
        ["lab1-alice", "lab1-bob"],
      )
    })

    it("returns leaf names for projects nested in subgroups, with subgroup-qualified identifiers", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/groups/parent-group",
          status: 200,
          body: { id: 99 },
        },
        {
          method: "GET",
          urlPattern: /\/groups\/99\/projects/,
          status: 200,
          body: [
            {
              path: "lab-1",
              path_with_namespace: "parent-group/team-101/lab-1",
              archived: false,
            },
            {
              path: "lab-1",
              path_with_namespace: "parent-group/team-102/lab-1",
              archived: false,
            },
            {
              path: "syllabus",
              path_with_namespace: "parent-group/syllabus",
              archived: false,
            },
          ],
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.listRepositories(baseDraft, {
        namespace: "parent-group",
      })

      assert.deepStrictEqual(
        result.repositories
          .map(({ name, identifier }) => ({ name, identifier }))
          .sort((a, b) => a.identifier.localeCompare(b.identifier)),
        [
          { name: "syllabus", identifier: "syllabus" },
          { name: "lab-1", identifier: "team-101/lab-1" },
          { name: "lab-1", identifier: "team-102/lab-1" },
        ],
      )
    })

    it("filters subgroup-nested projects by glob against the leaf name, not the subgroup prefix", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/groups/parent-group",
          status: 200,
          body: { id: 77 },
        },
        {
          method: "GET",
          urlPattern: /\/groups\/77\/projects/,
          status: 200,
          body: [
            {
              path: "lab-1",
              path_with_namespace: "parent-group/111_foo/lab-1",
              archived: false,
            },
            {
              path: "stray",
              path_with_namespace: "parent-group/111_foo/stray",
              archived: false,
            },
            {
              path: "lab-2",
              path_with_namespace: "parent-group/112_bar/lab-2",
              archived: false,
            },
          ],
        },
      ])

      const client = createGitLabClient(http)
      // Filter `lab-*` must match by LEAF name only. The subgroup `111_foo`
      // happens to satisfy the prior identifier-based behaviour, but `stray`
      // inside that subgroup must still be excluded — otherwise the preview
      // would show rows that don't match the pattern the user typed.
      const result = await client.listRepositories(baseDraft, {
        namespace: "parent-group",
        filter: "lab-*",
      })

      assert.deepStrictEqual(
        result.repositories
          .map(({ name, identifier }) => ({ name, identifier }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        [
          { name: "lab-1", identifier: "111_foo/lab-1" },
          { name: "lab-2", identifier: "112_bar/lab-2" },
        ],
      )
    })

    it("returns archived projects when includeArchived is true", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/groups/my-group",
          status: 200,
          body: { id: 7 },
        },
        {
          method: "GET",
          urlPattern: /\/groups\/7\/projects/,
          status: 200,
          body: [
            { path: "fresh", archived: false },
            { path: "frozen", archived: true },
          ],
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.listRepositories(baseDraft, {
        namespace: "my-group",
        includeArchived: true,
      })

      assert.deepStrictEqual(
        result.repositories
          .map((entry) => ({ name: entry.name, archived: entry.archived }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        [
          { name: "fresh", archived: false },
          { name: "frozen", archived: true },
        ],
      )
    })

    it("returns an empty list when the namespace cannot be resolved", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/groups/no-such-group",
          status: 404,
          body: { message: "404 Not Found" },
        },
        {
          method: "GET",
          urlPattern: /\/users\?username=no-such-group/,
          status: 200,
          body: [],
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.listRepositories(baseDraft, {
        namespace: "no-such-group",
      })

      assert.deepStrictEqual(result.repositories, [])
    })
  })
})
