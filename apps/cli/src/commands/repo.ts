import path from "node:path"
import type { RecordedRepositoriesByAssignment } from "@repo-edu/application-contract"
import { planRepositoryOperation } from "@repo-edu/domain/repository-planning"
import type {
  PersistedCourse,
  RepositoryTemplate,
} from "@repo-edu/domain/types"
import type { Command } from "commander"
import {
  emitCommandError,
  loadSelectedCourse,
  resolveAssignmentFromCourse,
  toErrorMessage,
} from "../command-utils.js"
import { createCliWorkflowClient } from "../workflow-runtime.js"

type RepoCreateOptions = {
  assignment?: string
  all?: boolean
  dryRun?: boolean
  templatePath?: string
}

type RepoCloneOptions = {
  assignment?: string
  all?: boolean
  target?: string
  layout?: "flat" | "by-team" | "by-task"
}

type RepoUpdateOptions = {
  assignment?: string
  templatePath?: string
}

type RepoDiscoverOptions = {
  namespace?: string
  filter?: string
  includeArchived?: boolean
  target?: string
  yes?: boolean
}

function resolveLocalTemplateOverride(
  templatePath: string | undefined,
  course: PersistedCourse,
): RepositoryTemplate | null {
  if (!templatePath) return null
  return {
    kind: "local",
    path: path.resolve(templatePath),
    visibility: course.repositoryTemplate?.visibility ?? "private",
  }
}

function normalizeCliTargetDirectory(rawInput: string): string {
  const trimmed = rawInput.trim()
  if (
    trimmed === "~" ||
    trimmed.startsWith("~/") ||
    trimmed.startsWith("~\\")
  ) {
    return trimmed
  }
  if (path.isAbsolute(trimmed)) {
    return trimmed
  }
  return path.resolve(process.cwd(), trimmed)
}

function printRepositoryPlan(
  assignmentName: string,
  assignmentId: string,
  courseId: string,
) {
  process.stdout.write(
    `Planned repository operation for assignment '${assignmentName}' (${assignmentId}) in course '${courseId}':\n`,
  )
}

function resolveAssignmentSelection(
  course: PersistedCourse,
  assignment: string | undefined,
  all: boolean | undefined,
) {
  if (all && assignment) {
    throw new Error("Use either --assignment or --all, not both.")
  }
  if (!all && !assignment) {
    throw new Error("Provide --assignment <name> or --all.")
  }

  if (all) {
    return null
  }

  const resolved = resolveAssignmentFromCourse(course, assignment ?? "")
  if (!resolved) {
    throw new Error(
      `Assignment '${assignment}' was not found in course '${course.id}'.`,
    )
  }
  return resolved
}

function applyTemplateCommitShas(
  course: PersistedCourse,
  templateCommitShas: Record<string, string>,
): PersistedCourse {
  if (Object.keys(templateCommitShas).length === 0) {
    return course
  }
  let changed = false
  const assignments = course.roster.assignments.map((assignment) => {
    const templateCommitSha = templateCommitShas[assignment.id]
    if (
      !templateCommitSha ||
      assignment.templateCommitSha === templateCommitSha
    ) {
      return assignment
    }
    changed = true
    return {
      ...assignment,
      templateCommitSha,
    }
  })
  if (!changed) {
    return course
  }
  return {
    ...course,
    roster: {
      ...course.roster,
      assignments,
    },
  }
}

function mergeAssignmentRepositories(
  course: PersistedCourse,
  assignmentId: string,
  incoming: Record<string, string>,
): Record<string, string> | null {
  const assignment = course.roster.assignments.find(
    (candidate) => candidate.id === assignmentId,
  )
  if (!assignment) return null
  const groupSet = course.roster.groupSets.find(
    (candidate) => candidate.id === assignment.groupSetId,
  )
  const validGroupIds = new Set<string>(
    groupSet === undefined
      ? []
      : groupSet.nameMode === "named"
        ? groupSet.groupIds
        : groupSet.teams.map((team) => team.id),
  )
  const merged: Record<string, string> = {}
  for (const [groupId, repoName] of Object.entries(
    assignment.repositories ?? {},
  )) {
    if (validGroupIds.has(groupId)) {
      merged[groupId] = repoName
    }
  }
  for (const [groupId, repoName] of Object.entries(incoming)) {
    if (validGroupIds.has(groupId)) {
      merged[groupId] = repoName
    }
  }
  const existingEntries = Object.entries(assignment.repositories ?? {}).sort()
  const mergedEntries = Object.entries(merged).sort()
  const unchanged =
    existingEntries.length === mergedEntries.length &&
    existingEntries.every(
      ([key, value], index) =>
        mergedEntries[index]?.[0] === key &&
        mergedEntries[index]?.[1] === value,
    )
  return unchanged ? null : merged
}

function applyRecordedRepositories(
  course: PersistedCourse,
  recordedRepositories: RecordedRepositoriesByAssignment,
): PersistedCourse {
  if (Object.keys(recordedRepositories).length === 0) {
    return course
  }
  let changed = false
  const assignments = course.roster.assignments.map((assignment) => {
    const incoming = recordedRepositories[assignment.id]
    if (!incoming) return assignment
    const merged = mergeAssignmentRepositories(course, assignment.id, incoming)
    if (merged === null) return assignment
    changed = true
    return {
      ...assignment,
      repositories: merged,
    }
  })
  if (!changed) return course
  return {
    ...course,
    roster: {
      ...course.roster,
      assignments,
    },
  }
}

function countRecordedRepositories(
  recorded: RecordedRepositoriesByAssignment,
): number {
  let count = 0
  for (const groupMap of Object.values(recorded)) {
    count += Object.keys(groupMap).length
  }
  return count
}

async function promptConfirmation(message: string): Promise<boolean> {
  process.stdout.write(`${message} [y/N] `)
  return new Promise((resolve) => {
    let buffer = ""
    const stdin = process.stdin
    stdin.setEncoding("utf8")
    const onData = (chunk: string) => {
      buffer += chunk
      if (buffer.includes("\n")) {
        stdin.removeListener("data", onData)
        stdin.pause()
        const answer = buffer.trim().toLowerCase()
        resolve(answer === "y" || answer === "yes")
      }
    }
    stdin.resume()
    stdin.on("data", onData)
  })
}

export function registerRepoCommands(parent: Command): void {
  const repo = parent.command("repo").description("Repository operations")

  repo
    .command("create")
    .description("Create repositories")
    .option("--assignment <name>", "Assignment name or id")
    .option("--all", "Run across all assignments")
    .option("--dry-run", "Show what would be created")
    .option(
      "--template-path <dir>",
      "Local template directory (must be a Git repository)",
    )
    .action(async function (this: Command, options: RepoCreateOptions) {
      const workflowClient = createCliWorkflowClient()

      try {
        const { course, settings } = await loadSelectedCourse(
          this,
          workflowClient,
        )
        const assignment = resolveAssignmentSelection(
          course,
          options.assignment,
          options.all,
        )
        if (options.dryRun) {
          const assignments =
            assignment === null ? course.roster.assignments : [assignment]
          for (const selectedAssignment of assignments) {
            const planned = planRepositoryOperation(
              course,
              selectedAssignment.id,
              "create",
            )
            if (!planned.ok) {
              process.stdout.write("Repository plan is invalid:\n")
              for (const issue of planned.issues) {
                process.stdout.write(`- ${issue.path}: ${issue.message}\n`)
              }
              process.exitCode = 1
              return
            }

            printRepositoryPlan(
              selectedAssignment.name,
              selectedAssignment.id,
              course.id,
            )
            if (planned.value.groups.length === 0) {
              process.stdout.write("- No repositories planned.\n")
            }
            for (const group of planned.value.groups) {
              const groupLabel = group.groupName || group.groupId
              process.stdout.write(
                `- ${group.repoName}\tgroup=${groupLabel}\tassignment=${group.assignmentName}\n`,
              )
            }
          }
          return
        }

        const template =
          resolveLocalTemplateOverride(options.templatePath, course) ??
          course.repositoryTemplate
        const result = await workflowClient.run("repo.create", {
          course,
          appSettings: settings,
          assignmentId: assignment?.id ?? null,
          template,
        })

        let nextCourse = applyTemplateCommitShas(
          course,
          result.templateCommitShas,
        )
        nextCourse = applyRecordedRepositories(
          nextCourse,
          result.recordedRepositories,
        )
        if (nextCourse !== course) {
          await workflowClient.run("course.save", nextCourse)
        }

        const recordedCount = countRecordedRepositories(
          result.recordedRepositories,
        )
        process.stdout.write(
          `Repository create complete: planned=${result.repositoriesPlanned} created=${result.repositoriesCreated} adopted=${result.repositoriesAdopted} failed=${result.repositoriesFailed} completedAt=${result.completedAt}\n`,
        )
        if (recordedCount > 0) {
          process.stdout.write(
            `Recorded repository names for ${recordedCount} group${recordedCount === 1 ? "" : "s"}.\n`,
          )
        }
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })

  repo
    .command("clone")
    .description("Clone repositories")
    .option("--assignment <name>", "Assignment name or id")
    .option("--all", "Run across all assignments")
    .option("--target <dir>", "Target directory")
    .option("--layout <layout>", "Directory layout: flat, by-team, by-task")
    .action(async function (this: Command, options: RepoCloneOptions) {
      const workflowClient = createCliWorkflowClient()

      try {
        const { course, settings } = await loadSelectedCourse(
          this,
          workflowClient,
        )
        const assignment = resolveAssignmentSelection(
          course,
          options.assignment,
          options.all,
        )
        if (
          options.layout !== undefined &&
          options.layout !== "flat" &&
          options.layout !== "by-team" &&
          options.layout !== "by-task"
        ) {
          throw new Error(
            "Invalid --layout value. Expected one of: flat, by-team, by-task.",
          )
        }

        const result = await workflowClient.run("repo.clone", {
          course,
          appSettings: settings,
          assignmentId: assignment?.id ?? null,
          template: course.repositoryTemplate,
          targetDirectory: normalizeCliTargetDirectory(options.target ?? "."),
          directoryLayout: options.layout,
        })

        const nextCourse = applyRecordedRepositories(
          course,
          result.recordedRepositories,
        )
        if (nextCourse !== course) {
          await workflowClient.run("course.save", nextCourse)
        }

        const recordedCount = countRecordedRepositories(
          result.recordedRepositories,
        )
        process.stdout.write(
          `Repository clone complete: planned=${result.repositoriesPlanned} cloned=${result.repositoriesCloned} failed=${result.repositoriesFailed} completedAt=${result.completedAt}\n`,
        )
        if (recordedCount > 0) {
          process.stdout.write(
            `Recorded repository names for ${recordedCount} group${recordedCount === 1 ? "" : "s"}.\n`,
          )
        }
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })

  repo
    .command("update")
    .description(
      "Create template update pull requests for assignment repositories",
    )
    .requiredOption("--assignment <name>", "Assignment name or id")
    .option(
      "--template-path <dir>",
      "Local template directory (must be a Git repository)",
    )
    .action(async function (this: Command, options: RepoUpdateOptions) {
      const workflowClient = createCliWorkflowClient()

      try {
        const { course, settings } = await loadSelectedCourse(
          this,
          workflowClient,
        )
        const assignment = resolveAssignmentFromCourse(
          course,
          options.assignment ?? "",
        )
        if (!assignment) {
          throw new Error(
            `Assignment '${options.assignment}' was not found in course '${course.id}'.`,
          )
        }

        const templateOverride = resolveLocalTemplateOverride(
          options.templatePath,
          course,
        )
        const result = await workflowClient.run("repo.update", {
          course,
          appSettings: settings,
          assignmentId: assignment.id,
          ...(templateOverride ? { templateOverride } : {}),
        })

        let nextCourse = course
        if (result.templateCommitSha) {
          nextCourse = {
            ...nextCourse,
            roster: {
              ...nextCourse.roster,
              assignments: nextCourse.roster.assignments.map((entry) =>
                entry.id === assignment.id
                  ? {
                      ...entry,
                      templateCommitSha: result.templateCommitSha,
                    }
                  : entry,
              ),
            },
          }
        }
        nextCourse = applyRecordedRepositories(
          nextCourse,
          result.recordedRepositories,
        )
        if (nextCourse !== course) {
          await workflowClient.run("course.save", nextCourse)
        }

        const recordedCount = countRecordedRepositories(
          result.recordedRepositories,
        )
        process.stdout.write(
          `Repository update complete: planned=${result.repositoriesPlanned} prsCreated=${result.prsCreated} prsSkipped=${result.prsSkipped} prsFailed=${result.prsFailed} completedAt=${result.completedAt}\n`,
        )
        if (recordedCount > 0) {
          process.stdout.write(
            `Recorded repository names for ${recordedCount} group${recordedCount === 1 ? "" : "s"}.\n`,
          )
        }
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })

  repo
    .command("discover")
    .description(
      "List repositories in a namespace by pattern and clone them to a folder",
    )
    .requiredOption("--namespace <name>", "Namespace (org or user) to list")
    .option("--filter <pattern>", "Glob pattern to filter repo names")
    .option("--include-archived", "Include archived repositories")
    .requiredOption("--target <dir>", "Target directory for clones")
    .option("--yes", "Skip interactive confirmation")
    .action(async function (this: Command, options: RepoDiscoverOptions) {
      const workflowClient = createCliWorkflowClient()
      try {
        const settings = await workflowClient.run("settings.loadApp", undefined)

        if (!options.namespace) {
          throw new Error("--namespace is required")
        }
        if (!options.target) {
          throw new Error("--target is required")
        }
        const targetDirectory = normalizeCliTargetDirectory(options.target)

        const listResult = await workflowClient.run("repo.listNamespace", {
          appSettings: settings,
          namespace: options.namespace,
          filter: options.filter,
          includeArchived: options.includeArchived,
        })

        process.stdout.write(
          `Found ${listResult.repositories.length} repositor${
            listResult.repositories.length === 1 ? "y" : "ies"
          } in '${options.namespace}'.\n`,
        )
        for (const entry of listResult.repositories) {
          const subgroup =
            entry.identifier !== entry.name &&
            entry.identifier.endsWith(`/${entry.name}`)
              ? entry.identifier.slice(0, -`/${entry.name}`.length)
              : ""
          const subgroupAnnotation = subgroup ? `\t(${subgroup})` : ""
          const archivedAnnotation = entry.archived ? "\t(archived)" : ""
          process.stdout.write(
            `- ${entry.name}${subgroupAnnotation}${archivedAnnotation}\n`,
          )
        }

        if (listResult.repositories.length === 0) {
          return
        }

        const nonInteractive = !process.stdin.isTTY
        if (!options.yes) {
          if (nonInteractive) {
            throw new Error(
              "Pass --yes to clone non-interactively (stdin is not a TTY).",
            )
          }
          const confirmed = await promptConfirmation(
            `Clone ${listResult.repositories.length} repositor${
              listResult.repositories.length === 1 ? "y" : "ies"
            } to '${targetDirectory}'?`,
          )
          if (!confirmed) {
            process.stdout.write("Aborted.\n")
            return
          }
        }

        const cloneResult = await workflowClient.run("repo.bulkClone", {
          appSettings: settings,
          namespace: options.namespace,
          repositories: listResult.repositories.map(({ name, identifier }) => ({
            name,
            identifier,
          })),
          targetDirectory,
        })
        process.stdout.write(
          `Cloned ${cloneResult.repositoriesCloned} / failed ${cloneResult.repositoriesFailed} completedAt=${cloneResult.completedAt}\n`,
        )
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })
}
