import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getFixture } from "@repo-edu/test-fixtures"
import {
  createGroupSetWorkflowHandlers,
  createInMemoryAppSettingsStore,
  createInMemoryProfileStore,
} from "../index.js"

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
  const profile = cloneValue(fixture.profile)
  const settings = cloneValue(fixture.settings)

  return createGroupSetWorkflowHandlers(
    createInMemoryProfileStore([profile]),
    createInMemoryAppSettingsStore(settings),
    {
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
    },
  )
}

describe("fixture-backed group-set conflict previews", () => {
  it("flags duplicate memberships in import preview", async () => {
    const lines = groupCsvArtifact.text.trim().split(/\r?\n/)
    const duplicateMembershipCsv = [...lines, lines[1]].join("\n")
    const handlers = makeGroupSetHandlers(duplicateMembershipCsv)

    await assert.rejects(
      handlers["groupSet.previewImportFromFile"]({
        profileId: fixture.profile.id,
        file: {
          kind: "user-file-ref",
          referenceId: "groups-csv",
          displayName: "groups.csv",
          mediaType: "text/csv",
          byteLength: null,
        },
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
    const handlers = makeGroupSetHandlers(unknownEmailCsv)

    const preview = await handlers["groupSet.previewImportFromFile"]({
      profileId: fixture.profile.id,
      file: {
        kind: "user-file-ref",
        referenceId: "groups-csv",
        displayName: "groups.csv",
        mediaType: "text/csv",
        byteLength: null,
      },
    })

    assert.equal(preview.mode, "import")
    assert.equal(preview.totalMissing > 0, true)
    assert.equal(preview.missingMembers.length > 0, true)
  })

  it("reports added/removed/renamed/updated groups in reimport preview", async () => {
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
      fixture.profile.roster.students.find(
        (student) => !updateOriginalEmails.has(student.email),
      )?.email ?? fixture.profile.roster.students[0]?.email
    assert.ok(replacementEmail)

    const renamedGroupName = `${renameTarget.groupName}-renamed`
    const addedGroupName = "added-group-from-reimport"
    const reimportCsv = [
      "group_name,group_id,email",
      `${renamedGroupName},${renameTarget.groupId},${renameTarget.email}`,
      `${updateTarget.groupName},${updateTarget.groupId},${replacementEmail}`,
      `${addedGroupName},,${replacementEmail}`,
    ].join("\n")

    const targetGroupSet = fixture.profile.roster.groupSets.find(
      (groupSet) => groupSet.connection === null,
    )
    assert.ok(targetGroupSet)

    const handlers = makeGroupSetHandlers(reimportCsv)
    const preview = await handlers["groupSet.previewReimportFromFile"]({
      profileId: fixture.profile.id,
      groupSetId: targetGroupSet.id,
      file: {
        kind: "user-file-ref",
        referenceId: "groups-csv",
        displayName: "groups.csv",
        mediaType: "text/csv",
        byteLength: null,
      },
    })

    assert.equal(preview.mode, "reimport")
    if (preview.mode !== "reimport") {
      return
    }

    assert.deepEqual(preview.renamedGroups, [
      {
        from: renameTarget.groupName,
        to: renamedGroupName,
      },
    ])
    assert.equal(
      preview.removedGroupNames.includes(removeTarget.groupName),
      true,
    )
    assert.equal(preview.addedGroupNames.includes(addedGroupName), true)
    assert.equal(
      preview.updatedGroupNames.includes(updateTarget.groupName),
      true,
    )
  })
})
