import { Command } from "commander"
import { registerCourseCommands } from "./commands/course.js"
import { registerGitCommands } from "./commands/git.js"
import { registerLmsCommands } from "./commands/lms.js"
import { registerRepoCommands } from "./commands/repo.js"
import { registerValidateCommand } from "./commands/validate.js"

export function createProgram(): Command {
  const program = new Command()
  program
    .name("redu")
    .description("Repository management for education")
    .version("0.1.0")
    .option("--course <name>", "Course to use (default: active course)")
    .action(() => {
      program.outputHelp()
    })

  registerCourseCommands(program)
  registerLmsCommands(program)
  registerGitCommands(program)
  registerRepoCommands(program)
  registerValidateCommand(program)

  return program
}
