import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, test } from "node:test"
import {
  loadCohortTeamSelections,
  parseTeamSelectionList,
  resolveProjectSpec,
  resolveTeamSourcePath,
} from "./cohort-team-source.js"
import { setFixtureRuntimeRoots } from "./constants.js"

let workDir: string

beforeEach(() => {
  workDir = mkdtempSync(resolve(tmpdir(), "fixture-cohort-team-source-"))
  setFixtureRuntimeRoots({ workspaceRoot: workDir, fixturesDir: workDir })
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function writeJson(path: string, value: unknown): string {
  writeFileSync(path, JSON.stringify(value))
  return path
}

describe("parseTeamSelectionList", () => {
  test("parses comma-separated indices and inclusive ranges", () => {
    assert.deepEqual(parseTeamSelectionList("1-3,5,8-9"), [1, 2, 3, 5, 8, 9])
  })

  test("deduplicates selected indices while preserving first order", () => {
    assert.deepEqual(parseTeamSelectionList("1,2,2,1-3"), [1, 2, 3])
  })
})

describe("cohort path resolution", () => {
  test("resolves bare project ids and cohort filenames under docs fixtures", () => {
    assert.equal(
      resolveProjectSpec("calculator").projectPath,
      resolve(workDir, "apps/docs/src/fixtures/projects/calculator/spec.md"),
    )
    assert.equal(
      resolveTeamSourcePath("lms.json"),
      resolve(workDir, "apps/docs/src/fixtures/demo-cohorts/lms.json"),
    )
  })
})

describe("loadCohortTeamSelections", () => {
  test("loads ordered LMS group members by assignment and team index", () => {
    const path = writeJson(resolve(workDir, "lms.json"), {
      students: {
        m1: { name: "Alex Doe", email: "alex@example.edu" },
        m2: { name: "Bea Roe", email: "bea@example.edu" },
        m3: { name: "Cal Fox", email: "cal@example.edu" },
      },
      assignments: { calculator: { groupSetId: "gs1" } },
      groupSets: { gs1: { groups: ["g1", "g2"] } },
      groups: {
        g1: { memberIds: ["m1", "m2"] },
        g2: { memberIds: ["m3"] },
      },
    })

    assert.deepEqual(loadCohortTeamSelections(path, "calculator", "2"), [
      {
        sourcePath: path,
        assignmentId: "calculator",
        teamIndex: 2,
        teamId: "g2",
        members: [{ name: "Cal Fox", email: "cal@example.edu" }],
      },
    ])
  })

  test("loads ordered RepoBee inline members", () => {
    const path = writeJson(resolve(workDir, "repobee.json"), {
      assignments: { calculator: { teamSetId: "ts1" } },
      teamSets: { ts1: { teams: ["ut1"] } },
      teams: {
        ut1: {
          members: [
            {
              name: "Alex Doe",
              email: "alex@example.edu",
              gitUsername: "alex-doe",
            },
          ],
        },
      },
    })

    assert.deepEqual(loadCohortTeamSelections(path, "calculator", "1"), [
      {
        sourcePath: path,
        assignmentId: "calculator",
        teamIndex: 1,
        teamId: "ut1",
        members: [
          {
            name: "Alex Doe",
            email: "alex@example.edu",
            gitUsername: "alex-doe",
          },
        ],
      },
    ])
  })

  test("rejects out-of-range team indices with source context", () => {
    const path = writeJson(resolve(workDir, "lms.json"), {
      students: { m1: { name: "Alex Doe", email: "alex@example.edu" } },
      assignments: { calculator: { groupSetId: "gs1" } },
      groupSets: { gs1: { groups: ["g1"] } },
      groups: { g1: { memberIds: ["m1"] } },
    })

    assert.throws(
      () => loadCohortTeamSelections(path, "calculator", "2"),
      /--teams index 2 out of range for assignment calculator \(1 teams\)/,
    )
  })
})
