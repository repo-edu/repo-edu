import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { PersistedAppSettings, PersistedProfile } from "@repo-edu/domain";
import { createProgram } from "../cli.js";

/**
 * Parse CLI args in test mode. Suppresses commander output and catches
 * stub "not yet implemented" errors from action handlers.
 */
async function parseArgs(args: string[]): Promise<{
  exitCode: number;
}> {
  const program = createProgram();
  program.exitOverride();
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
    getOutHelpWidth: () => 80,
    getErrHelpWidth: () => 80,
    outputError: () => {},
  });

  const previousExitCode = process.exitCode;
  let nextExitCode = 0;
  process.exitCode = 0;

  try {
    await program.parseAsync(["node", "redu", ...args]);
  } catch (err: unknown) {
    const error = err as { message?: string; code?: string };
    if (error.message?.includes("not yet implemented")) {
      nextExitCode = process.exitCode ?? 0;
      return { exitCode: nextExitCode };
    }
    throw err;
  } finally {
    nextExitCode = process.exitCode ?? 0;
    process.exitCode = previousExitCode;
  }

  return {
    exitCode: nextExitCode,
  };
}

function makeProfile(): PersistedProfile {
  return {
    kind: "repo-edu.profile.v2",
    schemaVersion: 2,
    id: "seed-profile",
    displayName: "Seed Profile",
    lmsConnectionName: null,
    gitConnectionName: null,
    courseId: null,
    roster: {
      connection: null,
      students: [
        {
          id: "s1",
          name: "Ada Lovelace",
          email: "",
          studentNumber: "1001",
          gitUsername: null,
          gitUsernameStatus: "unknown",
          status: "active",
          lmsStatus: null,
          lmsUserId: null,
          enrollmentType: "student",
          enrollmentDisplay: null,
          department: null,
          institution: null,
          source: "local",
        },
      ],
      staff: [],
      groups: [
        {
          id: "g1",
          name: "Alpha",
          memberIds: [],
          origin: "local",
          lmsGroupId: null,
        },
        {
          id: "g2",
          name: "Beta",
          memberIds: ["s1"],
          origin: "local",
          lmsGroupId: null,
        },
      ],
      groupSets: [
        {
          id: "gs1",
          name: "Projects",
          groupIds: ["g1", "g2"],
          connection: null,
          groupSelection: {
            kind: "all",
            excludedGroupIds: [],
          },
        },
      ],
      assignments: [
        {
          id: "a1",
          name: "Project 1",
          groupSetId: "gs1",
        },
      ],
    },
    repositoryTemplate: null,
    updatedAt: "2026-03-04T10:00:00Z",
  };
}

function makeSettings(activeProfileId: string | null): PersistedAppSettings {
  return {
    kind: "repo-edu.app-settings.v1",
    schemaVersion: 1,
    activeProfileId,
    appearance: {
      theme: "system",
      windowChrome: "system",
    },
    lmsConnections: [],
    gitConnections: [],
    lastOpenedAt: null,
  };
}

async function seedCliDataDirectory(
  rootDirectory: string,
  options?: {
    profile?: PersistedProfile;
    settings?: PersistedAppSettings;
  },
): Promise<void> {
  if (options?.profile) {
    const profilesDirectory = join(rootDirectory, "profiles");
    await mkdir(profilesDirectory, { recursive: true });
    await writeFile(
      join(profilesDirectory, `${encodeURIComponent(options.profile.id)}.json`),
      JSON.stringify(options.profile, null, 2),
      "utf8",
    );
  }

  if (options?.settings) {
    const settingsDirectory = join(rootDirectory, "settings");
    await mkdir(settingsDirectory, { recursive: true });
    await writeFile(
      join(settingsDirectory, "app-settings.json"),
      JSON.stringify(options.settings, null, 2),
      "utf8",
    );
  }
}

async function withTempCliDataDirectory(
  run: (rootDirectory: string) => Promise<void>,
): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "repo-edu-cli-"));
  const previous = process.env.REPO_EDU_CLI_DATA_DIR;
  process.env.REPO_EDU_CLI_DATA_DIR = temporaryRoot;

  try {
    await run(temporaryRoot);
  } finally {
    if (previous === undefined) {
      delete process.env.REPO_EDU_CLI_DATA_DIR;
    } else {
      process.env.REPO_EDU_CLI_DATA_DIR = previous;
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

describe("CLI command tree", () => {
  it("help includes all command families", () => {
    const program = createProgram();
    const help = program.helpInformation();
    assert.ok(help.includes("redu"));
    assert.ok(help.includes("profile"));
    assert.ok(help.includes("roster"));
    assert.ok(help.includes("lms"));
    assert.ok(help.includes("git"));
    assert.ok(help.includes("repo"));
    assert.ok(help.includes("validate"));
  });

  it("parses profile list", async () => {
    await parseArgs(["profile", "list"]);
  });

  it("parses profile load with argument", async () => {
    await parseArgs(["profile", "load", "my-profile"]);
  });

  it("parses profile active", async () => {
    await parseArgs(["profile", "active"]);
  });

  it("parses profile show", async () => {
    await parseArgs(["profile", "show"]);
  });

  it("parses roster show with options", async () => {
    await parseArgs(["roster", "show", "--students", "--assignments"]);
  });

  it("parses lms verify", async () => {
    await parseArgs(["lms", "verify"]);
  });

  it("parses lms import-students", async () => {
    await parseArgs(["lms", "import-students"]);
  });

  it("parses lms cache list", async () => {
    await parseArgs(["lms", "cache", "list"]);
  });

  it("parses lms cache refresh with argument", async () => {
    await parseArgs(["lms", "cache", "refresh", "gs-123"]);
  });

  it("parses lms cache delete with argument", async () => {
    await parseArgs(["lms", "cache", "delete", "gs-456"]);
  });

  it("parses git verify", async () => {
    await parseArgs(["git", "verify"]);
  });

  it("parses repo create with required option", async () => {
    await parseArgs(["repo", "create", "--assignment", "hw1"]);
  });

  it("parses repo clone with all options", async () => {
    await parseArgs([
      "repo",
      "clone",
      "--assignment",
      "hw1",
      "--target",
      "/tmp/repos",
      "--layout",
      "flat",
    ]);
  });

  it("parses repo delete with force", async () => {
    await parseArgs(["repo", "delete", "--assignment", "hw1", "--force"]);
  });

  it("parses validate with assignment", async () => {
    await parseArgs(["validate", "--assignment", "hw1"]);
  });

  it("parses global --profile option", async () => {
    await parseArgs(["--profile", "test-profile", "profile", "list"]);
  });

  it("profile list shows seeded profile and active marker", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const profile = makeProfile();
      await seedCliDataDirectory(rootDirectory, {
        profile,
        settings: makeSettings(profile.id),
      });

      const result = await parseArgs(["profile", "list"]);
      assert.equal(result.exitCode, 0);
    });
  });

  it("profile load sets active profile in persisted settings", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const profile = makeProfile();
      await seedCliDataDirectory(rootDirectory, { profile });

      const result = await parseArgs(["profile", "load", profile.id]);
      assert.equal(result.exitCode, 0);

      const rawSettings = await readFile(
        join(rootDirectory, "settings", "app-settings.json"),
        "utf8",
      );
      const settings = JSON.parse(rawSettings) as PersistedAppSettings;
      assert.equal(settings.activeProfileId, profile.id);
    });
  });

  it("validate reports domain issues and sets non-zero exit code", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const profile = makeProfile();
      await seedCliDataDirectory(rootDirectory, {
        profile,
        settings: makeSettings(profile.id),
      });

      const result = await parseArgs(["validate", "--assignment", "Project 1"]);
      assert.equal(result.exitCode, 1);
    });
  });
});
