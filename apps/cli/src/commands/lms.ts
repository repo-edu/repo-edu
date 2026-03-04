import type { Command } from "commander";

function notImplemented() {
  throw new Error("This command is not yet implemented.");
}

export function registerLmsCommands(parent: Command): void {
  const lms = parent.command("lms").description("LMS operations");

  lms
    .command("verify")
    .description("Verify LMS connection")
    .action(notImplemented);

  lms
    .command("import-students")
    .description("Import students from LMS")
    .action(notImplemented);

  lms
    .command("import-groups")
    .description("Attach a group-set to an assignment")
    .option("--assignment <name>", "Target assignment name")
    .option("--group-set <id>", "Group-set ID")
    .option("--from-cache", "Use cached group-set data")
    .action(notImplemented);

  const cache = lms.command("cache").description("Manage cached group-sets");

  cache
    .command("list")
    .description("List cached group-sets")
    .action(notImplemented);

  cache
    .command("fetch")
    .description("Link a group-set from LMS")
    .option("--group-set <id>", "LMS group-set ID")
    .action(notImplemented);

  cache
    .command("refresh")
    .description("Refresh a linked group-set")
    .argument("<group-set-id>", "Cached group-set ID")
    .action(notImplemented);

  cache
    .command("delete")
    .description("Delete a cached group-set")
    .argument("<group-set-id>", "Cached group-set ID")
    .action(notImplemented);
}
