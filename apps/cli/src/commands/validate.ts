import {
  createProfileWorkflowHandlers,
  createSettingsWorkflowHandlers,
  createValidationWorkflowHandlers,
} from "@repo-edu/application";
import type { Command } from "commander";
import {
  createCliAppSettingsStore,
  createCliProfileStore,
} from "../state-store.js";

function emitCommandError(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return String(error);
}

function resolveRequestedProfileId(
  command: Command,
  fallbackActiveProfileId: string | null,
): string | null {
  const options = command.optsWithGlobals() as { profile?: unknown };
  if (typeof options.profile === "string" && options.profile.length > 0) {
    return options.profile;
  }

  return fallbackActiveProfileId;
}

export function registerValidateCommand(parent: Command): void {
  parent
    .command("validate")
    .description("Validate assignment readiness")
    .requiredOption("--assignment <name>", "Assignment name")
    .action(async function (this: Command, options: { assignment: string }) {
      const profileHandlers = createProfileWorkflowHandlers(
        createCliProfileStore(),
      );
      const settingsHandlers = createSettingsWorkflowHandlers(
        createCliAppSettingsStore(),
      );
      const validationHandlers = createValidationWorkflowHandlers(
        createCliProfileStore(),
      );

      try {
        const settings = await settingsHandlers["settings.loadApp"](undefined);
        const selectedProfileId = resolveRequestedProfileId(
          this,
          settings.activeProfileId,
        );

        if (selectedProfileId === null) {
          emitCommandError(
            "No active profile. Use --profile <id> or `redu profile load <id>`.",
          );
          return;
        }

        const profile = await profileHandlers["profile.load"]({
          profileId: selectedProfileId,
        });
        const assignment = profile.roster.assignments.find(
          (entry) =>
            entry.name.toLowerCase() === options.assignment.toLowerCase() ||
            entry.id === options.assignment,
        );

        if (!assignment) {
          emitCommandError(
            `Assignment '${options.assignment}' was not found in profile '${profile.id}'.`,
          );
          return;
        }

        const rosterValidation = await validationHandlers["validation.roster"]({
          profileId: selectedProfileId,
        });
        const assignmentValidation = await validationHandlers[
          "validation.assignment"
        ]({
          profileId: selectedProfileId,
          assignmentId: assignment.id,
        });
        const allIssues = [
          ...rosterValidation.issues,
          ...assignmentValidation.issues,
        ];

        if (allIssues.length === 0) {
          process.stdout.write(
            `Validation passed for assignment '${assignment.name}' in profile '${profile.id}'.\n`,
          );
          return;
        }

        process.stdout.write(
          `Validation found ${allIssues.length} issue(s) for assignment '${assignment.name}' in profile '${profile.id}':\n`,
        );
        for (const issue of allIssues) {
          process.stdout.write(
            `- ${issue.kind} [${issue.affectedIds.join(", ")}]${issue.context ? `: ${issue.context}` : ""}\n`,
          );
        }
        process.exitCode = 1;
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });
}
