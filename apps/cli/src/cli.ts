import type { WorkflowClient } from "@repo-edu/application-contract"
import { Command } from "commander"
import pkg from "../package.json" with { type: "json" }
import { registerCourseCommands } from "./commands/course.js"
import { registerGitCommands } from "./commands/git.js"
import { registerLmsCommands } from "./commands/lms.js"
import { registerRepoCommands } from "./commands/repo.js"
import { registerUpdateCommand } from "./commands/update.js"
import { registerValidateCommand } from "./commands/validate.js"

// The program owns only the command tree. Its caller composes the workflow
// client, so the storage root and the child-process lifetime controller stay
// with the one owner that claimed the gate and can stop the controller.
export type CreateProgramOptions = {
  createWorkflowClient: () => WorkflowClient
}

export function createProgram(options: CreateProgramOptions): Command {
  const program = new Command()
  program
    .name("redu")
    .description("Repository management for education")
    .version(pkg.version)
    .option("--course <id>", "Course id (required for course-scoped commands)")
    .action(() => {
      program.outputHelp()
    })

  registerCourseCommands(program, options.createWorkflowClient)
  registerLmsCommands(program, options.createWorkflowClient)
  registerGitCommands(program, options.createWorkflowClient)
  registerRepoCommands(program, options.createWorkflowClient)
  registerUpdateCommand(program, pkg.version)
  registerValidateCommand(program, options.createWorkflowClient)

  return program
}
