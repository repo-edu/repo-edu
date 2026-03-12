import type { Command } from "commander"
import {
  emitCommandError,
  loadSelectedCourse,
  toErrorMessage,
} from "../command-utils.js"
import { createCliWorkflowClient } from "../workflow-runtime.js"

type RosterShowOptions = {
  students?: boolean
  assignments?: boolean
}

export function registerRosterCommands(parent: Command): void {
  const roster = parent.command("roster").description("Roster operations")

  roster
    .command("show")
    .description("Show roster summary")
    .option("--students", "Include student list")
    .option("--assignments", "Include assignment/group details")
    .action(async function (this: Command, options: RosterShowOptions) {
      const workflowClient = createCliWorkflowClient()

      try {
        const { course } = await loadSelectedCourse(this, workflowClient)

        process.stdout.write(`Course: ${course.id} (${course.displayName})\n`)
        process.stdout.write(`Students: ${course.roster.students.length}\n`)
        process.stdout.write(`Staff: ${course.roster.staff.length}\n`)
        process.stdout.write(`Groups: ${course.roster.groups.length}\n`)
        process.stdout.write(`Group sets: ${course.roster.groupSets.length}\n`)
        process.stdout.write(
          `Assignments: ${course.roster.assignments.length}\n`,
        )

        if (options.students) {
          process.stdout.write("\nStudents:\n")
          for (const student of course.roster.students) {
            process.stdout.write(
              `- ${student.id}\t${student.name}\t${student.email || "(no email)"}\t${student.gitUsername ?? "(no git username)"}\n`,
            )
          }
        }

        if (options.assignments) {
          process.stdout.write("\nAssignments:\n")
          const groupSetById = new Map(
            course.roster.groupSets.map((groupSet) => [groupSet.id, groupSet]),
          )

          for (const assignment of course.roster.assignments) {
            const groupSet = groupSetById.get(assignment.groupSetId)
            process.stdout.write(
              `- ${assignment.id}\t${assignment.name}\tgroup-set=${groupSet?.name ?? assignment.groupSetId}\n`,
            )
          }
        }
      } catch (error) {
        emitCommandError(toErrorMessage(error))
      }
    })
}
