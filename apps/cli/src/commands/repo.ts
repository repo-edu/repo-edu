import path from "node:path"
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
            const groupSet = course.roster.groupSets.find(
              (candidate) => candidate.id === selectedAssignment.groupSetId,
            )
            const planned = planRepositoryOperation(
              course.roster,
              selectedAssignment.id,
              groupSet?.repoNameTemplate ?? undefined,
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
              process.stdout.write(
                `- ${group.repoName}\tgroup=${group.groupName}\tassignment=${group.assignmentName}\n`,
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

        const nextCourse = applyTemplateCommitShas(
          course,
          result.templateCommitShas,
        )
        if (nextCourse !== course) {
          await workflowClient.run("course.save", nextCourse)
        }

        process.stdout.write(
          `Repository create complete: planned=${result.repositoriesPlanned} created=${result.repositoriesCreated} existing=${result.repositoriesAlreadyExisted} failed=${result.repositoriesFailed} completedAt=${result.completedAt}\n`,
        )
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
          targetDirectory: options.target,
          directoryLayout: options.layout,
        })

        process.stdout.write(
          `Repository clone complete: planned=${result.repositoriesPlanned} cloned=${result.repositoriesCloned} failed=${result.repositoriesFailed} completedAt=${result.completedAt}\n`,
        )
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

        if (result.templateCommitSha) {
          const updatedCourse: PersistedCourse = {
            ...course,
            roster: {
              ...course.roster,
              assignments: course.roster.assignments.map((entry) =>
                entry.id === assignment.id
                  ? {
                      ...entry,
                      templateCommitSha: result.templateCommitSha,
                    }
                  : entry,
              ),
            },
          }
          await workflowClient.run("course.save", updatedCourse)
        }

        process.stdout.write(
          `Repository update complete: planned=${result.repositoriesPlanned} prsCreated=${result.prsCreated} prsSkipped=${result.prsSkipped} prsFailed=${result.prsFailed} completedAt=${result.completedAt}\n`,
        )
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })
}
