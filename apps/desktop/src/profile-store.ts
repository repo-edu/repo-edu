import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProfileStore } from "@repo-edu/application";
import {
  type PersistedProfile,
  type Roster,
  validatePersistedProfile,
} from "@repo-edu/domain";
import { desktopSeedProfileId } from "./profile-ids";

function createSeedRoster(): Roster {
  const roster: Roster = {
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
      {
        id: "s2",
        name: "Grace Hopper",
        email: "grace@example.com",
        studentNumber: "1002",
        gitUsername: "ghopper",
        gitUsernameStatus: "valid",
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
        id: "g-seed-alpha",
        name: "Alpha",
        memberIds: ["s1"],
        origin: "local",
        lmsGroupId: null,
      },
      {
        id: "g-seed-empty",
        name: "Empty Group",
        memberIds: [],
        origin: "local",
        lmsGroupId: null,
      },
      {
        id: "g-system-s1",
        name: "ada_lovelace",
        memberIds: ["s1"],
        origin: "system",
        lmsGroupId: null,
      },
      {
        id: "g-system-s2",
        name: "grace_hopper",
        memberIds: ["s2"],
        origin: "system",
        lmsGroupId: null,
      },
      {
        id: "g-system-staff",
        name: "staff",
        memberIds: [],
        origin: "system",
        lmsGroupId: null,
      },
    ],
    groupSets: [
      {
        id: "gs-seed-projects",
        name: "Projects",
        groupIds: ["g-seed-alpha", "g-seed-empty"],
        connection: null,
        groupSelection: {
          kind: "all",
          excludedGroupIds: [],
        },
      },
      {
        id: "gs-system-individual",
        name: "Individual Students",
        groupIds: ["g-system-s1", "g-system-s2"],
        connection: {
          kind: "system",
          systemType: "individual_students",
        },
        groupSelection: {
          kind: "all",
          excludedGroupIds: [],
        },
      },
      {
        id: "gs-system-staff",
        name: "Staff",
        groupIds: ["g-system-staff"],
        connection: {
          kind: "system",
          systemType: "staff",
        },
        groupSelection: {
          kind: "all",
          excludedGroupIds: [],
        },
      },
    ],
    assignments: [
      {
        id: "a-seed-project-1",
        name: "Project 1",
        groupSetId: "gs-seed-projects",
      },
    ],
  };

  return roster;
}

function createSeedProfile(): PersistedProfile {
  return {
    kind: "repo-edu.profile.v2",
    schemaVersion: 2,
    id: desktopSeedProfileId,
    displayName: "Seed Profile",
    lmsConnectionName: null,
    gitConnectionName: null,
    courseId: null,
    roster: createSeedRoster(),
    repositoryTemplate: null,
    updatedAt: "2026-03-04T10:00:00Z",
  };
}

function resolveProfilesDirectory(storageRoot: string): string {
  return join(storageRoot, "profiles");
}

function resolveProfilePath(storageRoot: string, profileId: string): string {
  return join(
    resolveProfilesDirectory(storageRoot),
    `${encodeURIComponent(profileId)}.json`,
  );
}

async function ensureSeedProfile(storageRoot: string): Promise<void> {
  const directory = resolveProfilesDirectory(storageRoot);
  const seedPath = resolveProfilePath(storageRoot, desktopSeedProfileId);

  await mkdir(directory, { recursive: true });

  try {
    await readFile(seedPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }

    await writeFile(
      seedPath,
      JSON.stringify(createSeedProfile(), null, 2),
      "utf8",
    );
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.");
  }
}

async function readPersistedProfile(
  profilePath: string,
): Promise<PersistedProfile> {
  const raw = await readFile(profilePath, "utf8");
  const parsed = JSON.parse(raw) as PersistedProfile;
  const validation = validatePersistedProfile(parsed);
  if (!validation.ok) {
    throw new Error(
      `Invalid persisted profile at ${profilePath}: ${validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  return validation.value;
}

export function createDesktopProfileStore(storageRoot: string): ProfileStore {
  return {
    async listProfiles(signal?: AbortSignal) {
      throwIfAborted(signal);
      await ensureSeedProfile(storageRoot);
      throwIfAborted(signal);

      const directory = resolveProfilesDirectory(storageRoot);
      const entries = await readdir(directory, { withFileTypes: true });
      const profiles: PersistedProfile[] = [];

      for (const entry of entries) {
        throwIfAborted(signal);
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue;
        }

        profiles.push(await readPersistedProfile(join(directory, entry.name)));
      }

      return profiles;
    },
    async loadProfile(profileId: string, signal?: AbortSignal) {
      throwIfAborted(signal);
      await ensureSeedProfile(storageRoot);
      throwIfAborted(signal);

      const profilePath = resolveProfilePath(storageRoot, profileId);

      try {
        return await readPersistedProfile(profilePath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          return null;
        }

        if (
          profileId === desktopSeedProfileId &&
          error instanceof SyntaxError
        ) {
          const seed = createSeedProfile();
          await writeFile(profilePath, JSON.stringify(seed, null, 2), "utf8");
          return seed;
        }

        throw error;
      }
    },
    async saveProfile(profile: PersistedProfile, signal?: AbortSignal) {
      throwIfAborted(signal);
      const validation = validatePersistedProfile(profile);
      if (!validation.ok) {
        throw new Error(
          `Invalid persisted profile: ${validation.issues
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join("; ")}`,
        );
      }

      await ensureSeedProfile(storageRoot);
      throwIfAborted(signal);

      const profilePath = resolveProfilePath(storageRoot, profile.id);
      await writeFile(
        profilePath,
        JSON.stringify(validation.value, null, 2),
        "utf8",
      );
      return validation.value;
    },
  };
}
