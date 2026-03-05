import type { WorkflowClient } from "@repo-edu/application-contract";
import type { Assignment, PersistedProfile, PersistedAppSettings } from "@repo-edu/domain";
import type { Command } from "commander";

export function emitCommandError(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

export function toErrorMessage(error: unknown): string {
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

export function resolveRequestedProfileId(
  command: Command,
  fallbackActiveProfileId: string | null,
): string | null {
  const options = command.optsWithGlobals() as { profile?: unknown };
  if (typeof options.profile === "string" && options.profile.length > 0) {
    return options.profile;
  }

  return fallbackActiveProfileId;
}

export async function loadSelectedProfile(
  command: Command,
  workflowClient: WorkflowClient,
): Promise<{
  selectedProfileId: string;
  settings: PersistedAppSettings;
  profile: PersistedProfile;
}> {
  const settings = await workflowClient.run("settings.loadApp", undefined);
  const selectedProfileId = resolveRequestedProfileId(
    command,
    settings.activeProfileId,
  );

  if (selectedProfileId === null) {
    throw new Error(
      "No active profile. Use --profile <id> or `redu profile load <id>`.",
    );
  }

  const profile = await workflowClient.run("profile.load", {
    profileId: selectedProfileId,
  });

  return {
    selectedProfileId,
    settings,
    profile,
  };
}

export function resolveAssignmentFromProfile(
  profile: PersistedProfile,
  assignmentKey: string,
): Assignment | null {
  const normalized = assignmentKey.trim().toLowerCase();

  return (
    profile.roster.assignments.find(
      (assignment) =>
        assignment.id.toLowerCase() === normalized ||
        assignment.name.toLowerCase() === normalized,
    ) ?? null
  );
}

export function requireLmsConnection(
  profile: PersistedProfile,
  settings: PersistedAppSettings,
) {
  if (profile.lmsConnectionName === null) {
    throw new Error("Selected profile does not reference an LMS connection.");
  }

  const connection = settings.lmsConnections.find(
    (candidate) => candidate.name === profile.lmsConnectionName,
  );

  if (!connection) {
    throw new Error(
      `LMS connection '${profile.lmsConnectionName}' was not found in app settings.`,
    );
  }

  return connection;
}

export function requireGitConnection(
  profile: PersistedProfile,
  settings: PersistedAppSettings,
) {
  if (profile.gitConnectionName === null) {
    throw new Error("Selected profile does not reference a Git connection.");
  }

  const connection = settings.gitConnections.find(
    (candidate) => candidate.name === profile.gitConnectionName,
  );

  if (!connection) {
    throw new Error(
      `Git connection '${profile.gitConnectionName}' was not found in app settings.`,
    );
  }

  return connection;
}
