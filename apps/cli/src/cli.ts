import { Command } from "commander";
import { registerGitCommands } from "./commands/git.js";
import { registerLmsCommands } from "./commands/lms.js";
import { registerProfileCommands } from "./commands/profile.js";
import { registerRepoCommands } from "./commands/repo.js";
import { registerRosterCommands } from "./commands/roster.js";
import { registerValidateCommand } from "./commands/validate.js";

export function createProgram(): Command {
  const program = new Command();
  program
    .name("redu")
    .description("Repository management for education")
    .version("0.1.0")
    .option("--profile <name>", "Profile to use (default: active profile)");

  registerProfileCommands(program);
  registerRosterCommands(program);
  registerLmsCommands(program);
  registerGitCommands(program);
  registerRepoCommands(program);
  registerValidateCommand(program);

  return program;
}
