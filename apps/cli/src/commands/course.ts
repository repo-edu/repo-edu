import type { Command } from "commander"
import {
  emitCommandError,
  loadSelectedCourse,
  resolveRequestedCourseId,
  toErrorMessage,
} from "../command-utils.js"
import { createCliWorkflowClient } from "../workflow-runtime.js"

export function registerCourseCommands(parent: Command): void {
  const course = parent.command("course").description("Course management")

  course
    .command("list")
    .description("List all courses")
    .action(async function (this: Command) {
      const workflowClient = createCliWorkflowClient()

      try {
        const listedCourses = await workflowClient.run("course.list", undefined)
        const settings = await workflowClient.run("settings.loadApp", undefined)
        const selectedCourseId = resolveRequestedCourseId(
          this,
          settings.activeCourseId,
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
      const workflowClient = createCliWorkflowClient()

      try {
        const settings = await workflowClient.run("settings.loadApp", undefined)
        const selectedCourseId = resolveRequestedCourseId(
          this,
          settings.activeCourseId,
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
      const workflowClient = createCliWorkflowClient()

      try {
        const loaded = await loadSelectedCourse(this, workflowClient)
        process.stdout.write(`${JSON.stringify(loaded.course, null, 2)}\n`)
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })

  course
    .command("delete")
    .description("Delete a course")
    .argument("<course-id>", "Course id to delete")
    .action(async function (this: Command, courseId: string) {
      const workflowClient = createCliWorkflowClient()

      try {
        const currentSettings = await workflowClient.run(
          "settings.loadApp",
          undefined,
        )
        await workflowClient.run("course.delete", { courseId })

        if (currentSettings.activeCourseId === courseId) {
          const remainingCourses = await workflowClient.run(
            "course.list",
            undefined,
          )
          await workflowClient.run("settings.saveApp", {
            ...currentSettings,
            activeCourseId: remainingCourses[0]?.id ?? null,
          })
        }

        process.stdout.write(`Deleted course '${courseId}'.\n`)
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })

  course
    .command("load")
    .description("Set active course")
    .argument("<course-id>", "Course id to activate")
    .action(async (courseId: string) => {
      const workflowClient = createCliWorkflowClient()

      try {
        const loadedCourse = await workflowClient.run("course.load", {
          courseId,
        })
        const currentSettings = await workflowClient.run(
          "settings.loadApp",
          undefined,
        )
        await workflowClient.run("settings.saveApp", {
          ...currentSettings,
          activeCourseId: loadedCourse.id,
        })

        process.stdout.write(`Active course set to '${loadedCourse.id}'.\n`)
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })
}
