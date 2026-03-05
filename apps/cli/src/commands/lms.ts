import type { GroupSet, PersistedProfile } from "@repo-edu/domain";
import type { Command } from "commander";
import {
  emitCommandError,
  loadSelectedProfile,
  requireLmsConnection,
  toErrorMessage,
} from "../command-utils.js";
import { createCliWorkflowClient } from "../workflow-runtime.js";

type LmsImportGroupsOptions = {
  groupSet?: string;
};

type LmsCacheFetchOptions = {
  groupSet?: string;
};

function printCachedGroupSet(groupSet: GroupSet): void {
  const connection = groupSet.connection;
  const provider = connection?.kind ?? "local";
  let remoteId = "-";

  if (connection?.kind === "canvas") {
    remoteId = connection.groupSetId;
  }
  if (connection?.kind === "moodle") {
    remoteId = connection.groupingId;
  }

  process.stdout.write(
    `- ${groupSet.id}\t${groupSet.name}\tprovider=${provider}\tremote=${remoteId}\n`,
  );
}

function removeCachedGroupSet(
  profile: PersistedProfile,
  groupSetId: string,
): PersistedProfile {
  const target = profile.roster.groupSets.find((groupSet) => groupSet.id === groupSetId);
  if (!target) {
    throw new Error(`Cached group set '${groupSetId}' was not found.`);
  }

  const assignmentUsingTarget = profile.roster.assignments.find(
    (assignment) => assignment.groupSetId === groupSetId,
  );
  if (assignmentUsingTarget) {
    throw new Error(
      `Cannot delete cached group set '${groupSetId}' because assignment '${assignmentUsingTarget.name}' still references it.`,
    );
  }

  const sharedGroupIds = new Set<string>();
  for (const groupSet of profile.roster.groupSets) {
    if (groupSet.id === groupSetId) {
      continue;
    }

    for (const memberId of groupSet.groupIds) {
      sharedGroupIds.add(memberId);
    }
  }

  const removableGroupIds = new Set(
    target.groupIds.filter((groupId) => !sharedGroupIds.has(groupId)),
  );

  return {
    ...profile,
    roster: {
      ...profile.roster,
      groupSets: profile.roster.groupSets.filter(
        (groupSet) => groupSet.id !== groupSetId,
      ),
      groups: profile.roster.groups.filter(
        (group) => !removableGroupIds.has(group.id),
      ),
    },
  };
}

export function registerLmsCommands(parent: Command): void {
  const lms = parent.command("lms").description("LMS operations");

  lms
    .command("verify")
    .description("Verify LMS connection for selected profile")
    .action(async function (this: Command) {
      const workflowClient = createCliWorkflowClient();

      try {
        const { profile, settings } = await loadSelectedProfile(this, workflowClient);
        const connection = requireLmsConnection(profile, settings);
        const result = await workflowClient.run("connection.verifyLmsDraft", {
          provider: connection.provider,
          baseUrl: connection.baseUrl,
          token: connection.token,
        });

        process.stdout.write(
          `LMS connection '${connection.name}' verified=${result.verified} checkedAt=${result.checkedAt}\n`,
        );
        if (!result.verified) {
          process.exitCode = 1;
        }
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });

  lms
    .command("import-students")
    .description("Import students from LMS and save to the selected profile")
    .action(async function (this: Command) {
      const workflowClient = createCliWorkflowClient();

      try {
        const { profile } = await loadSelectedProfile(this, workflowClient);
        if (profile.courseId === null) {
          throw new Error("Selected profile does not have a configured courseId.");
        }

        const roster = await workflowClient.run("roster.importFromLms", {
          profileId: profile.id,
          courseId: profile.courseId,
        });

        await workflowClient.run("profile.save", {
          ...profile,
          roster,
        });

        process.stdout.write(
          `Imported ${roster.students.length} students from LMS into profile '${profile.id}'.\n`,
        );
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });

  lms
    .command("import-groups")
    .description("Sync an LMS-linked group set into the selected profile")
    .requiredOption("--group-set <id>", "Group-set ID to sync")
    .action(async function (this: Command, options: LmsImportGroupsOptions) {
      const workflowClient = createCliWorkflowClient();

      try {
        const { profile } = await loadSelectedProfile(this, workflowClient);

        const result = await workflowClient.run("groupSet.syncFromLms", {
          profileId: profile.id,
          groupSetId: String(options.groupSet),
        });

        process.stdout.write(
          `Synced group set '${result.name}' (${result.id}) with ${result.groupIds.length} groups.\n`,
        );
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });

  const cache = lms.command("cache").description("Manage cached LMS group sets");

  cache
    .command("list")
    .description("List cached LMS group sets in selected profile")
    .action(async function (this: Command) {
      const workflowClient = createCliWorkflowClient();

      try {
        const { profile } = await loadSelectedProfile(this, workflowClient);

        const cached = profile.roster.groupSets.filter(
          (groupSet) =>
            groupSet.connection?.kind === "canvas" ||
            groupSet.connection?.kind === "moodle",
        );

        if (cached.length === 0) {
          process.stdout.write("No LMS cached group sets.\n");
          return;
        }

        for (const groupSet of cached) {
          printCachedGroupSet(groupSet);
        }
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });

  cache
    .command("fetch")
    .description("Fetch available LMS group sets for selected profile")
    .option("--group-set <id>", "Specific LMS group-set ID")
    .action(async function (this: Command, options: LmsCacheFetchOptions) {
      const workflowClient = createCliWorkflowClient();

      try {
        const { profile } = await loadSelectedProfile(this, workflowClient);
        const available = await workflowClient.run(
          "groupSet.fetchAvailableFromLms",
          {
            profileId: profile.id,
          },
        );

        if (options.groupSet) {
          const selected = available.find((entry) => entry.id === options.groupSet);
          if (!selected) {
            throw new Error(`LMS group set '${options.groupSet}' was not found.`);
          }

          process.stdout.write(
            `${selected.id}\t${selected.name}\tgroups=${selected.groupCount}\n`,
          );
          return;
        }

        if (available.length === 0) {
          process.stdout.write("No LMS group sets available.\n");
          return;
        }

        for (const entry of available) {
          process.stdout.write(
            `${entry.id}\t${entry.name}\tgroups=${entry.groupCount}\n`,
          );
        }
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });

  cache
    .command("refresh")
    .description("Refresh a cached group set")
    .argument("<group-set-id>", "Cached group-set ID")
    .action(async function (this: Command, groupSetId: string) {
      const workflowClient = createCliWorkflowClient();

      try {
        const { profile } = await loadSelectedProfile(this, workflowClient);
        const result = await workflowClient.run("groupSet.syncFromLms", {
          profileId: profile.id,
          groupSetId,
        });

        process.stdout.write(
          `Refreshed cached group set '${result.name}' (${result.id}).\n`,
        );
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });

  cache
    .command("delete")
    .description("Delete a cached group set")
    .argument("<group-set-id>", "Cached group-set ID")
    .action(async function (this: Command, groupSetId: string) {
      const workflowClient = createCliWorkflowClient();

      try {
        const loaded = await loadSelectedProfile(this, workflowClient);
        const nextProfile = removeCachedGroupSet(loaded.profile, groupSetId);

        await workflowClient.run("profile.save", nextProfile);

        process.stdout.write(`Deleted cached group set '${groupSetId}'.\n`);
      } catch (error) {
        emitCommandError(toErrorMessage(error));
      }
    });
}
