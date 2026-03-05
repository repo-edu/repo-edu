import type { Command } from "commander";
import {
  emitCommandError,
  loadSelectedProfile,
  resolveRequestedProfileId,
  toErrorMessage,
} from "../command-utils.js";
import { createCliWorkflowClient } from "../workflow-runtime.js";

export function registerProfileCommands(parent: Command): void {
  const profile = parent.command("profile").description("Profile management");

  profile
    .command("list")
    .description("List all profiles")
    .action(async function (this: Command) {
      const workflowClient = createCliWorkflowClient();

      try {
        const listedProfiles = await workflowClient.run("profile.list", undefined);
        const settings = await workflowClient.run("settings.loadApp", undefined);
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
      const workflowClient = createCliWorkflowClient();

      try {
        const settings = await workflowClient.run("settings.loadApp", undefined);
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
      const workflowClient = createCliWorkflowClient();

      try {
        const loaded = await loadSelectedProfile(this, workflowClient);
        process.stdout.write(`${JSON.stringify(loaded.profile, null, 2)}\n`);
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });

  profile
    .command("load")
    .description("Set active profile")
    .argument("<profile-id>", "Profile id to activate")
    .action(async (profileId: string) => {
      const workflowClient = createCliWorkflowClient();

      try {
        const loadedProfile = await workflowClient.run("profile.load", {
          profileId,
        });
        const currentSettings = await workflowClient.run(
          "settings.loadApp",
          undefined,
        );
        await workflowClient.run("settings.saveApp", {
          ...currentSettings,
          activeProfileId: loadedProfile.id,
        });

        process.stdout.write(`Active profile set to '${loadedProfile.id}'.\n`);
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });
}
