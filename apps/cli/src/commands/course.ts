import type { WorkflowClient } from "@repo-edu/application-contract"
import { activeCourseIdFromSurface } from "@repo-edu/domain/settings"
import type { Command } from "commander"
import {
  emitCommandError,
  loadAppSettings,
  loadSelectedCourse,
  resolveRequestedCourseId,
  toErrorMessage,
} from "../command-utils.js"
import { createCliWorkflowClient } from "../workflow-runtime.js"

export function registerCourseCommands(
  parent: Command,
  createWorkflow: () => WorkflowClient = createCliWorkflowClient,
): void {
  const course = parent.command("course").description("Course management")

  course
    .command("list")
    .description("List all courses")
    .action(async function (this: Command) {
      const workflowClient = createWorkflow()

      try {
        const listedCourses = await workflowClient.run("course.list", undefined)
        const settings = await loadAppSettings(workflowClient)
        const selectedCourseId = resolveRequestedCourseId(
          this,
          activeCourseIdFromSurface(settings.preferences.activeSurface),
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
    .description("Show active course name")
    .action(async function (this: Command) {
      const workflowClient = createWorkflow()

      try {
        const settings = await loadAppSettings(workflowClient)
        const selectedCourseId = resolveRequestedCourseId(
          this,
          activeCourseIdFromSurface(settings.preferences.activeSurface),
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
    .description("Show active course settings")
    .action(async function (this: Command) {
      const workflowClient = createWorkflow()

      try {
        const loaded = await loadSelectedCourse(this, workflowClient)
        process.stdout.write(`${JSON.stringify(loaded.course, null, 2)}\n`)
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })

  course
    .command("load")
    .description("Set active course")
    .argument("<course-id>", "Course id to activate")
    .action(async (courseId: string) => {
      const workflowClient = createWorkflow()

      try {
        const loadedCourse = await workflowClient.run("course.load", {
          courseId,
        })
        const currentSettings = await loadAppSettings(workflowClient)
        await workflowClient.run("settings.savePreferences", {
          ...currentSettings.preferences,
          activeSurface: { kind: "course", courseId: loadedCourse.id },
        })

        process.stdout.write(`Active course set to '${loadedCourse.id}'.\n`)
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })
}
