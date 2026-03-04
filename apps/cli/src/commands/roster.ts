import type { Command } from "commander";

function notImplemented() {
  throw new Error("This command is not yet implemented.");
}

export function registerRosterCommands(parent: Command): void {
  const roster = parent
    .command("roster")
    .description("Show roster information");

  roster
    .command("show")
    .description("Show roster summary")
    .option("--students", "Include student list")
    .option("--assignments", "Include assignment/group details")
    .action(notImplemented);
}
