import { planRepositoryOperation } from "@repo-edu/domain"
import type { Command } from "commander"
import {
  emitCommandError,
  loadSelectedCourse,
  resolveAssignmentFromCourse,
  toErrorMessage,
} from "../command-utils.js"
import { createCliWorkflowClient } from "../workflow-runtime.js"

type RepoCreateOptions = {
  assignment: string
  dryRun?: boolean
}

type RepoCloneOptions = {
  assignment: string
  target?: string
  layout?: "flat" | "by-team" | "by-task"
}

type RepoDeleteOptions = {
  assignment: string
  force?: boolean
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

export function registerRepoCommands(parent: Command): void {
  const repo = parent.command("repo").description("Repository operations")

  repo
    .command("create")
    .description("Create repositories")
    .requiredOption("--assignment <name>", "Assignment name or id")
    .option("--dry-run", "Show what would be created")
    .action(async function (this: Command, options: RepoCreateOptions) {
      const workflowClient = createCliWorkflowClient()

      try {
        const { course, settings } = await loadSelectedCourse(
          this,
          workflowClient,
        )
        const assignment = resolveAssignmentFromCourse(
          course,
          options.assignment,
        )

        if (!assignment) {
          throw new Error(
            `Assignment '${options.assignment}' was not found in course '${course.id}'.`,
          )
        }

        if (options.dryRun) {
          const planned = planRepositoryOperation(course.roster, assignment.id)
          if (!planned.ok) {
            process.stdout.write("Repository plan is invalid:\n")
            for (const issue of planned.issues) {
              process.stdout.write(`- ${issue.path}: ${issue.message}\n`)
            }
            process.exitCode = 1
            return
          }

          printRepositoryPlan(assignment.name, assignment.id, course.id)
          if (planned.value.groups.length === 0) {
            process.stdout.write("- No repositories planned.\n")
          }
          for (const group of planned.value.groups) {
            process.stdout.write(
              `- ${group.repoName}\tgroup=${group.groupName}\tassignment=${group.assignmentName}\n`,
            )
          }
          return
        }

        const result = await workflowClient.run("repo.create", {
          course,
          appSettings: settings,
          assignmentId: assignment.id,
          template: course.repositoryTemplate,
        })

        process.stdout.write(
          `Repository create complete: planned=${result.repositoriesPlanned} completedAt=${result.completedAt}\n`,
        )
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })

  repo
    .command("clone")
    .description("Clone repositories")
    .requiredOption("--assignment <name>", "Assignment name or id")
    .option("--target <dir>", "Target directory")
    .option("--layout <layout>", "Directory layout: flat, by-team, by-task")
    .action(async function (this: Command, options: RepoCloneOptions) {
      const workflowClient = createCliWorkflowClient()

      try {
        const { course, settings } = await loadSelectedCourse(
          this,
          workflowClient,
        )
        const assignment = resolveAssignmentFromCourse(
          course,
          options.assignment,
        )

        if (!assignment) {
          throw new Error(
            `Assignment '${options.assignment}' was not found in course '${course.id}'.`,
          )
        }

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
          assignmentId: assignment.id,
          template: course.repositoryTemplate,
          targetDirectory: options.target,
          directoryLayout: options.layout,
        })

        process.stdout.write(
          `Repository clone complete: planned=${result.repositoriesPlanned} completedAt=${result.completedAt}\n`,
        )
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })

  repo
    .command("delete")
    .description("Delete repositories")
    .requiredOption("--assignment <name>", "Assignment name or id")
    .option("--force", "Execute delete without interactive confirmation")
    .action(async function (this: Command, options: RepoDeleteOptions) {
      const workflowClient = createCliWorkflowClient()

      try {
        const { course, settings } = await loadSelectedCourse(
          this,
          workflowClient,
        )
        const assignment = resolveAssignmentFromCourse(
          course,
          options.assignment,
        )

        if (!assignment) {
          throw new Error(
            `Assignment '${options.assignment}' was not found in course '${course.id}'.`,
          )
        }

        const result = await workflowClient.run("repo.delete", {
          course,
          appSettings: settings,
          assignmentId: assignment.id,
          template: course.repositoryTemplate,
          confirmDelete: options.force === true,
        })

        process.stdout.write(
          `Repository delete complete: planned=${result.repositoriesPlanned} completedAt=${result.completedAt}\n`,
        )
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })
}
