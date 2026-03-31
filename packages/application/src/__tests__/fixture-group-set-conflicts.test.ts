import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getFixture } from "@repo-edu/test-fixtures"
import { createGroupSetWorkflowHandlers } from "../index.js"

type GroupCsvRow = {
  groupName: string
  groupId: string
  memberName: string
  email: string
}

const fixtureSelection = {
  tier: "small" as const,
  preset: "shared-teams" as const,
}

const fixture = getFixture(fixtureSelection)
const groupCsvArtifact = fixture.artifacts.find(
  (artifact) => artifact.displayName === "groups.csv",
)
if (!groupCsvArtifact) {
  throw new Error("Expected fixture groups.csv artifact.")
}

function cloneValue<TValue>(value: TValue): TValue {
  if (typeof structuredClone === "function") {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as TValue
}

function parseGroupsCsv(csvText: string): GroupCsvRow[] {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const [, ...rows] = lines
  return rows.map((row) => {
    const [groupName = "", groupId = "", memberName = "", email = ""] =
      row.split(",")
    return {
      groupName,
      groupId,
      memberName,
      email,
    }
  })
}

function makeGroupSetHandlers(profileCsvText: string) {
  const course = cloneValue(fixture.course)

  return {
    course,
    handlers: createGroupSetWorkflowHandlers({
      lms: {
        listGroupSets: async () => {
          throw new Error("not used")
        },
        fetchGroupSet: async () => {
          throw new Error("not used")
        },
      },
      userFile: {
        readText: async () => ({
          displayName: "groups.csv",
          mediaType: "text/csv",
          text: profileCsvText,
          byteLength: profileCsvText.length,
        }),
        writeText: async (reference) => ({
          displayName: reference.displayName,
          mediaType: "text/csv",
          byteLength: 0,
          savedAt: "2026-03-10T00:00:00.000Z",
        }),
      },
    }),
  }
}

describe("fixture-backed group-set conflict previews", () => {
  it("flags duplicate memberships in import preview", async () => {
    const lines = groupCsvArtifact.text.trim().split(/\r?\n/)
    const duplicateMembershipCsv = [...lines, lines[1]].join("\n")
    const { course, handlers } = makeGroupSetHandlers(duplicateMembershipCsv)

    await assert.rejects(
      handlers["groupSet.previewImportFromFile"]({
        course,
        file: {
          kind: "user-file-ref",
          referenceId: "groups-csv",
          displayName: "groups.csv",
          mediaType: "text/csv",
          byteLength: null,
        },
        format: "group-set-csv",
        targetGroupSetId: null,
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("reports missing members for unknown emails in import preview", async () => {
    const unknownEmailCsv = groupCsvArtifact.text.replace(
      "@example.edu",
      "@unknown.invalid",
    )
    const { course, handlers } = makeGroupSetHandlers(unknownEmailCsv)

    const preview = await handlers["groupSet.previewImportFromFile"]({
      course,
      file: {
        kind: "user-file-ref",
        referenceId: "groups-csv",
        displayName: "groups.csv",
        mediaType: "text/csv",
        byteLength: null,
      },
      format: "group-set-csv",
      targetGroupSetId: null,
    })

    assert.equal(preview.mode, "import")
    assert.equal(preview.totalMissing > 0, true)
    assert.equal(preview.missingMembers.length > 0, true)
  })

  it("previews import into an existing group set using unified preview workflow", async () => {
    const rows = parseGroupsCsv(groupCsvArtifact.text)
    const uniqueById = new Map<string, GroupCsvRow>()
    for (const row of rows) {
      if (!uniqueById.has(row.groupId)) {
        uniqueById.set(row.groupId, row)
      }
    }
    const uniqueRows = [...uniqueById.values()]
    assert.equal(uniqueRows.length >= 3, true)

    const renameTarget = uniqueRows[0]
    const updateTarget = uniqueRows[1]
    const removeTarget = uniqueRows[2]
    assert.ok(renameTarget)
    assert.ok(updateTarget)
    assert.ok(removeTarget)
    const rowsByGroupId = rows.reduce<Record<string, GroupCsvRow[]>>(
      (accumulator, row) => {
        const current = accumulator[row.groupId] ?? []
        current.push(row)
        accumulator[row.groupId] = current
        return accumulator
      },
      {},
    )

    const updateOriginalEmails = new Set(
      (rowsByGroupId[updateTarget.groupId] ?? [])
        .map((row) => row.email)
        .filter((email) => email.length > 0),
    )
    const replacementEmail =
      fixture.course.roster.students.find(
        (student) => !updateOriginalEmails.has(student.email),
      )?.email ?? fixture.course.roster.students[0]?.email
    assert.ok(replacementEmail)

    const renamedGroupName = `${renameTarget.groupName}-renamed`
    const reimportCsv = [
      "group_name,email",
      `${renamedGroupName},${renameTarget.email}`,
      `${updateTarget.groupName},${replacementEmail}`,
    ].join("\n")

    const targetGroupSet = fixture.course.roster.groupSets.find(
      (groupSet) => groupSet.connection === null,
    )
    assert.ok(targetGroupSet)

    const { course, handlers } = makeGroupSetHandlers(reimportCsv)
    const preview = await handlers["groupSet.previewImportFromFile"]({
      course,
      file: {
        kind: "user-file-ref",
        referenceId: "groups-csv",
        displayName: "groups.csv",
        mediaType: "text/csv",
        byteLength: null,
      },
      format: "group-set-csv",
      targetGroupSetId: targetGroupSet.id,
    })

    assert.equal(preview.mode, "import")
    if (preview.mode !== "import") {
      return
    }

    assert.equal(preview.groups.length > 0, true)
  })
})
