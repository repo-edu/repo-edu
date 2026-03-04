import {
  createProfileWorkflowHandlers,
  createSettingsWorkflowHandlers,
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

export function registerProfileCommands(parent: Command): void {
  const profile = parent.command("profile").description("Profile management");

  profile
    .command("list")
    .description("List all profiles")
    .action(async function (this: Command) {
      const profileHandlers = createProfileWorkflowHandlers(
        createCliProfileStore(),
      );
      const settingsHandlers = createSettingsWorkflowHandlers(
        createCliAppSettingsStore(),
      );

      try {
        const listedProfiles = await profileHandlers["profile.list"](undefined);
        const settings = await settingsHandlers["settings.loadApp"](undefined);
        const selectedProfileId = resolveRequestedProfileId(
          this,
          settings.activeProfileId,
        );

        if (listedProfiles.length === 0) {
          process.stdout.write("No profiles found.\n");
          return;
        }

        for (const profileSummary of listedProfiles) {
          const marker = profileSummary.id === selectedProfileId ? "*" : " ";
          process.stdout.write(
            `${marker} ${profileSummary.id}\t${profileSummary.displayName}\t${profileSummary.updatedAt}\n`,
          );
        }
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });

  profile
    .command("active")
    .description("Show active profile name")
    .action(async function (this: Command) {
      const settingsHandlers = createSettingsWorkflowHandlers(
        createCliAppSettingsStore(),
      );

      try {
        const settings = await settingsHandlers["settings.loadApp"](undefined);
        const selectedProfileId = resolveRequestedProfileId(
          this,
          settings.activeProfileId,
        );
        if (selectedProfileId === null) {
          process.stdout.write("No active profile.\n");
          return;
        }

        process.stdout.write(`${selectedProfileId}\n`);
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });

  profile
    .command("show")
    .description("Show active profile settings")
    .action(async function (this: Command) {
      const profileHandlers = createProfileWorkflowHandlers(
        createCliProfileStore(),
      );
      const settingsHandlers = createSettingsWorkflowHandlers(
        createCliAppSettingsStore(),
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

        const loadedProfile = await profileHandlers["profile.load"]({
          profileId: selectedProfileId,
        });
        process.stdout.write(`${JSON.stringify(loadedProfile, null, 2)}\n`);
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });

  profile
    .command("load")
    .description("Set active profile")
    .argument("<profile-id>", "Profile id to activate")
    .action(async (profileId: string) => {
      const profileHandlers = createProfileWorkflowHandlers(
        createCliProfileStore(),
      );
      const settingsHandlers = createSettingsWorkflowHandlers(
        createCliAppSettingsStore(),
      );

      try {
        const loadedProfile = await profileHandlers["profile.load"]({
          profileId,
        });
        const currentSettings =
          await settingsHandlers["settings.loadApp"](undefined);
        await settingsHandlers["settings.saveApp"]({
          ...currentSettings,
          activeProfileId: loadedProfile.id,
        });
        process.stdout.write(`Active profile set to '${loadedProfile.id}'.\n`);
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });
}
