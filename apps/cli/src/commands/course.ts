import type { WorkflowClient } from "@repo-edu/application-contract"
import { activeCourseIdFromSurface } from "@repo-edu/domain/active-surface"
import type { Command } from "commander"
import {
  emitCommandError,
  loadAppSettings,
  loadSelectedCourse,
  toErrorMessage,
} from "../command-utils.js"

export function registerCourseCommands(
  parent: Command,
  createWorkflow: () => WorkflowClient,
): void {
  const course = parent.command("course").description("Course management")

  course
    .command("list")
    .description("List all courses")
    .action(async () => {
      const workflowClient = createWorkflow()

      try {
        const listedCourses = await workflowClient.run("course.list", undefined)
        const settings = await loadAppSettings(workflowClient)
        const selectedCourseId = activeCourseIdFromSurface(
          settings.preferences.activeSurface,
        )

        if (listedCourses.length === 0) {
          process.stdout.write("No courses found.\n")
          return
        }

        for (const courseSummary of listedCourses) {
          const marker = courseSummary.id === selectedCourseId ? "*" : " "
          process.stdout.write(
            `${marker} ${courseSummary.id}\t${courseSummary.displayName}\t${courseSummary.updatedAt}\n`,
          )
        }
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })

  course
    .command("active")
    .description("Show the desktop active course id")
    .action(async () => {
      const workflowClient = createWorkflow()

      try {
        const settings = await loadAppSettings(workflowClient)
        const selectedCourseId = activeCourseIdFromSurface(
          settings.preferences.activeSurface,
        )

        if (selectedCourseId === null) {
          process.stdout.write("No active course.\n")
          return
        }

        process.stdout.write(`${selectedCourseId}\n`)
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })

  course
    .command("show")
    .description("Show selected course settings")
    .action(async function (this: Command) {
      const workflowClient = createWorkflow()

      try {
        const loaded = await loadSelectedCourse(this, workflowClient)
        process.stdout.write(`${JSON.stringify(loaded.course, null, 2)}\n`)
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })
}
