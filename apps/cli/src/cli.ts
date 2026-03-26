import { Command } from "commander"
import pkg from "../package.json" with { type: "json" }
import { registerCourseCommands } from "./commands/course.js"
import { registerGitCommands } from "./commands/git.js"
import { registerLmsCommands } from "./commands/lms.js"
import { registerRepoCommands } from "./commands/repo.js"
import { registerUpdateCommand } from "./commands/update.js"
import { registerValidateCommand } from "./commands/validate.js"

export function createProgram(): Command {
  const program = new Command()
  program
    .name("redu")
    .description("Repository management for education")
    .version(pkg.version)
    .option("--course <name>", "Course to use (default: active course)")
    .action(() => {
      program.outputHelp()
    })

  registerCourseCommands(program)
  registerLmsCommands(program)
  registerGitCommands(program)
  registerRepoCommands(program)
  registerUpdateCommand(program, pkg.version)
  registerValidateCommand(program)

  return program
}
