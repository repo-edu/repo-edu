import type { Command } from "commander";

function notImplemented() {
  throw new Error("This command is not yet implemented.");
}

export function registerGitCommands(parent: Command): void {
  const git = parent.command("git").description("Git platform operations");

  git
    .command("verify")
    .description("Verify git platform connection")
    .action(notImplemented);
}
