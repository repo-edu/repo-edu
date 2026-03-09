import type { Command } from "commander"
import {
  emitCommandError,
  loadSelectedProfile,
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
        const { profile } = await loadSelectedProfile(this, workflowClient)

        process.stdout.write(
          `Profile: ${profile.id} (${profile.displayName})\n`,
        )
        process.stdout.write(`Students: ${profile.roster.students.length}\n`)
        process.stdout.write(`Staff: ${profile.roster.staff.length}\n`)
        process.stdout.write(`Groups: ${profile.roster.groups.length}\n`)
        process.stdout.write(`Group sets: ${profile.roster.groupSets.length}\n`)
        process.stdout.write(
          `Assignments: ${profile.roster.assignments.length}\n`,
        )

        if (options.students) {
          process.stdout.write("\nStudents:\n")
          for (const student of profile.roster.students) {
            process.stdout.write(
              `- ${student.id}\t${student.name}\t${student.email || "(no email)"}\t${student.gitUsername ?? "(no git username)"}\n`,
            )
          }
        }

        if (options.assignments) {
          process.stdout.write("\nAssignments:\n")
          const groupSetById = new Map(
            profile.roster.groupSets.map((groupSet) => [groupSet.id, groupSet]),
          )

          for (const assignment of profile.roster.assignments) {
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
