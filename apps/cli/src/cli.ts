import type { WorkflowClient } from "@repo-edu/application-contract"
import type { ChildProcessLifetimeController } from "@repo-edu/host-node/child-process-lifetime"
import { Command } from "commander"
import pkg from "../package.json" with { type: "json" }
import { registerCourseCommands } from "./commands/course.js"
import { registerGitCommands } from "./commands/git.js"
import { registerLmsCommands } from "./commands/lms.js"
import { registerRepoCommands } from "./commands/repo.js"
import { registerUpdateCommand } from "./commands/update.js"
import { registerValidateCommand } from "./commands/validate.js"
import { createCliWorkflowClient } from "./workflow-runtime.js"

// Every caller supplies the child-lifetime adapter it owns and stops. The
// program never builds a lifetime owner of its own.
export type CreateProgramOptions = {
  childProcessLifetimeController: ChildProcessLifetimeController
  createWorkflowClient?: () => WorkflowClient
  signal?: AbortSignal
  storageRoot?: string
}

export function createProgram(options: CreateProgramOptions): Command {
  const createWorkflowClient =
    options.createWorkflowClient ??
    (() =>
      createCliWorkflowClient({
        childProcessLifetimeController: options.childProcessLifetimeController,
        signal: options.signal,
        storageRoot: options.storageRoot,
      }))
  const program = new Command()
  program
    .name("redu")
    .description("Repository management for education")
    .version(pkg.version)
    .option("--course <name>", "Course to use (default: active course)")
    .action(() => {
      program.outputHelp()
    })

  registerCourseCommands(program, createWorkflowClient)
  registerLmsCommands(program, createWorkflowClient)
  registerGitCommands(program, createWorkflowClient)
  registerRepoCommands(program, createWorkflowClient)
  registerUpdateCommand(program, pkg.version)
  registerValidateCommand(program, createWorkflowClient)

  return program
}
