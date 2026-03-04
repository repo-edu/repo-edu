import type { Command } from "commander";

function notImplemented() {
  throw new Error("This command is not yet implemented.");
}

export function registerRepoCommands(parent: Command): void {
  const repo = parent.command("repo").description("Repository operations");

  repo
    .command("create")
    .description("Create repositories")
    .requiredOption("--assignment <name>", "Assignment name")
    .option("--dry-run", "Show what would be created")
    .action(notImplemented);

  repo
    .command("clone")
    .description("Clone repositories")
    .requiredOption("--assignment <name>", "Assignment name")
    .option("--target <dir>", "Target directory")
    .option("--layout <layout>", "Directory layout: flat, by-team, by-task")
    .action(notImplemented);

  repo
    .command("delete")
    .description("Delete repositories")
    .requiredOption("--assignment <name>", "Assignment name")
    .option("--force", "Skip confirmation prompt")
    .action(notImplemented);
}
