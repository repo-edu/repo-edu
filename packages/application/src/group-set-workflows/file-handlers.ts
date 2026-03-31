import type {
  DiagnosticOutput,
  GroupSetExportInput,
  GroupSetImportFromFileInput,
  GroupSetPreviewImportFromFileInput,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import {
  exportGroupSetRows,
  exportRepoTeams,
  importGroupSet,
  previewImportGroupSet,
  previewReplaceGroupSetFromRepoBee,
  replaceGroupSetFromRepoBee,
} from "@repo-edu/domain/group-set-import-export"
import { reconcileRosterFromGitUsernames } from "@repo-edu/domain/roster-reconciliation"
import type {
  Group,
  GroupSet,
  GroupSetImportResult,
  PersistedCourse,
} from "@repo-edu/domain/types"
import type { UserFileText } from "@repo-edu/host-runtime-contract"
import { parseRepoBeeStudentsText } from "../adapters/repobee-students-parser.js"
import { parseCsv, serializeCsv } from "../adapters/tabular/index.js"
import { createValidationAppError } from "../core.js"
import {
  normalizeUserFileError,
  parseGroupSetImportRows,
  resolveCourseSnapshot,
  throwIfAborted,
} from "../workflow-helpers.js"
import { groupSetExportHeaders, serializeRepobeeYaml } from "./helpers.js"
import type { GroupSetWorkflowPorts } from "./ports.js"

function applyImportResultToCourse(
  course: PersistedCourse,
  result: GroupSetImportResult,
): PersistedCourse {
  const deletedGroupIdSet = new Set(result.deletedGroupIds)
  const groupsById = new Map<string, Group>()

  for (const group of course.roster.groups) {
    if (deletedGroupIdSet.has(group.id)) {
      continue
    }
    groupsById.set(group.id, group)
  }

  for (const group of result.groupsUpserted) {
    groupsById.set(group.id, group)
  }

  const nextGroupSets: GroupSet[] = []
  let replaced = false

  for (const groupSet of course.roster.groupSets) {
    if (groupSet.id === result.groupSet.id) {
      nextGroupSets.push(result.groupSet)
      replaced = true
      continue
    }

    if (deletedGroupIdSet.size === 0) {
      nextGroupSets.push(groupSet)
      continue
    }

    nextGroupSets.push({
      ...groupSet,
      groupIds: groupSet.groupIds.filter(
        (groupId) => !deletedGroupIdSet.has(groupId),
      ),
    })
  }

  if (!replaced) {
    nextGroupSets.push(result.groupSet)
  }

  return {
    ...course,
    idSequences: result.idSequences,
    roster: {
      ...course.roster,
      groups: [...groupsById.values()],
      groupSets: nextGroupSets,
    },
    updatedAt: new Date().toISOString(),
  }
}

function toImportSource(fileText: UserFileText) {
  return {
    sourceFilename: fileText.displayName,
    sourcePath: null,
    lastUpdated: new Date().toISOString(),
  }
}

function toValidationIssues(
  result: ReturnType<typeof parseRepoBeeStudentsText>,
): Array<{ path: string; message: string }> {
  if (result.ok) {
    return []
  }
  return result.issues
}

function uniqueRepoBeeUsernames(teams: readonly string[][]): string[] {
  return [...new Set(teams.flat())]
}

export function createFileGroupSetHandlers(
  ports: GroupSetWorkflowPorts,
): Pick<
  WorkflowHandlerMap<
    | "groupSet.previewImportFromFile"
    | "groupSet.importFromFile"
    | "groupSet.export"
  >,
  | "groupSet.previewImportFromFile"
  | "groupSet.importFromFile"
  | "groupSet.export"
> {
  return {
    "groupSet.previewImportFromFile": async (
      input: GroupSetPreviewImportFromFileInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading course snapshot for group-set import preview.",
      })
      const course = resolveCourseSnapshot(input.course)
      throwIfAborted(options?.signal)

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Reading and parsing group-set import file.",
      })

      let fileText: UserFileText
      try {
        fileText = await ports.userFile.readText(input.file, options?.signal)
      } catch (error) {
        throw normalizeUserFileError(error, "read")
      }

      if (input.format === "group-set-csv") {
        const parsedRows = parseGroupSetImportRows(parseCsv(fileText.text).rows)
        const preview = previewImportGroupSet(course.roster, parsedRows, {
          targetGroupSetId: input.targetGroupSetId,
          memberKey: "email",
        })
        if (!preview.ok) {
          throw createValidationAppError(
            "Group-set import preview failed.",
            preview.issues,
          )
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Group-set import preview complete.",
        })
        return preview.value
      }

      const parsed = parseRepoBeeStudentsText(fileText.text)
      if (!parsed.ok) {
        throw createValidationAppError(
          "RepoBee students preview failed.",
          toValidationIssues(parsed),
        )
      }

      if (input.targetGroupSetId === null) {
        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "RepoBee import preview complete.",
        })
        return {
          mode: "replace" as const,
          addedTeams: parsed.teams,
          removedTeams: [],
          changedTeams: [],
          unchangedTeams: [],
        }
      }

      const preview = previewReplaceGroupSetFromRepoBee(
        course.roster,
        input.targetGroupSetId,
        parsed.teams,
      )
      if (!preview.ok) {
        throw createValidationAppError(
          "RepoBee students preview failed.",
          preview.issues,
        )
      }

      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "RepoBee import preview complete.",
      })
      return preview.value
    },
    "groupSet.importFromFile": async (
      input: GroupSetImportFromFileInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 4
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading course snapshot for group-set import.",
      })
      const course = resolveCourseSnapshot(input.course)
      throwIfAborted(options?.signal)

      let fileText: UserFileText
      try {
        fileText = await ports.userFile.readText(input.file, options?.signal)
      } catch (error) {
        throw normalizeUserFileError(error, "read")
      }

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Parsing import file.",
      })

      const source = toImportSource(fileText)

      if (input.format === "group-set-csv") {
        const parsedRows = parseGroupSetImportRows(parseCsv(fileText.text).rows)
        const result = importGroupSet(
          course.roster,
          source,
          parsedRows,
          course.idSequences,
          {
            targetGroupSetId: input.targetGroupSetId,
            memberKey: "email",
          },
        )
        if (!result.ok) {
          throw createValidationAppError(
            "Group-set import failed.",
            result.issues,
          )
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Applying course updates.",
        })

        const nextCourse = applyImportResultToCourse(course, result.value)
        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Group-set import complete.",
        })
        return nextCourse
      }

      const parsed = parseRepoBeeStudentsText(fileText.text)
      if (!parsed.ok) {
        throw createValidationAppError(
          "RepoBee students import failed.",
          toValidationIssues(parsed),
        )
      }

      const reconciled = reconcileRosterFromGitUsernames(
        course.roster,
        uniqueRepoBeeUsernames(parsed.teams),
        course.idSequences,
      )

      const teams = parsed.teams.map((team) => ({
        usernames: team,
        memberIds: team
          .map((username) => reconciled.mapping[username])
          .filter((memberId): memberId is string => memberId !== undefined),
      }))

      const result = replaceGroupSetFromRepoBee(
        reconciled.roster,
        source,
        teams,
        reconciled.idSequences,
        {
          targetGroupSetId: input.targetGroupSetId,
          groupNameStrategy: input.groupNameStrategy,
        },
      )
      if (!result.ok) {
        throw createValidationAppError(
          "RepoBee students import failed.",
          result.issues,
        )
      }

      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Applying course updates.",
      })

      const nextCourse = applyImportResultToCourse(
        {
          ...course,
          roster: reconciled.roster,
          idSequences: reconciled.idSequences,
        },
        result.value,
      )

      options?.onProgress?.({
        step: 4,
        totalSteps,
        label: "RepoBee students import complete.",
      })
      return nextCourse
    },
    "groupSet.export": async (
      input: GroupSetExportInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ) => {
      const totalSteps = 3
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 1,
        totalSteps,
        label: "Reading course snapshot and group set for export.",
      })
      const course = resolveCourseSnapshot(input.course)
      throwIfAborted(options?.signal)

      const exportedRows = exportGroupSetRows(course.roster, input.groupSetId)
      if (!exportedRows.ok) {
        throw createValidationAppError(
          "Group-set export preparation failed.",
          exportedRows.issues,
        )
      }

      options?.onProgress?.({
        step: 2,
        totalSteps,
        label: "Serializing group-set export payload.",
      })
      let serialized = ""
      switch (input.format) {
        case "csv":
          serialized = serializeCsv({
            headers: [...groupSetExportHeaders],
            rows: exportedRows.value,
          })
          break
        case "yaml": {
          const teams = exportRepoTeams(course.roster, input.groupSetId)
          if (!teams.ok) {
            throw createValidationAppError(
              "Repobee YAML export preparation failed.",
              teams.issues,
            )
          }
          serialized = serializeRepobeeYaml(teams.value)
          break
        }
        case "xlsx":
          throw createValidationAppError(
            "Group-set export format is unsupported.",
            [
              {
                path: "format",
                message:
                  "XLSX group-set export is unsupported with the current text-based file port.",
              },
            ],
          )
      }

      await ports.userFile.writeText(input.target, serialized, options?.signal)
      throwIfAborted(options?.signal)
      options?.onProgress?.({
        step: 3,
        totalSteps,
        label: "Group-set export written.",
      })

      return { file: input.target }
    },
  }
}
