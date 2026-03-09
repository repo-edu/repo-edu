import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ProfileStore } from "@repo-edu/application"
import {
  type PersistedProfile,
  type Roster,
  validatePersistedProfile,
} from "@repo-edu/domain"
import { desktopSeedProfileId } from "./profile-ids"

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
  }

  return roster
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
  }
}

function resolveProfilesDirectory(storageRoot: string): string {
  return join(storageRoot, "profiles")
}

function sanitizeProfileFileBaseName(displayName: string): string {
  const normalized = displayName.trim().replace(/\s+/g, " ")
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional range for filename sanitization
  const withoutIllegal = normalized.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
  const withoutTrailingDots = withoutIllegal.replace(/[. ]+$/g, "")
  return withoutTrailingDots.length > 0 ? withoutTrailingDots : "profile"
}

function resolveProfilePathFromDisplayName(
  storageRoot: string,
  displayName: string,
  duplicateIndex = 0,
): string {
  const baseName = sanitizeProfileFileBaseName(displayName)
  const fileName =
    duplicateIndex === 0
      ? `${baseName}.json`
      : `${baseName} (${duplicateIndex + 1}).json`
  return join(resolveProfilesDirectory(storageRoot), fileName)
}

type ProfileFileInspection =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "profile"; profile: PersistedProfile }

async function inspectProfileFile(
  profilePath: string,
): Promise<ProfileFileInspection> {
  let raw: string
  try {
    raw = await readFile(profilePath, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "missing" }
    }
    throw error
  }

  try {
    const parsed = JSON.parse(raw) as PersistedProfile
    const validation = validatePersistedProfile(parsed)
    if (!validation.ok) {
      return { kind: "invalid" }
    }
    return { kind: "profile", profile: validation.value }
  } catch {
    return { kind: "invalid" }
  }
}

async function findProfilePathById(
  storageRoot: string,
  profileId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const directory = resolveProfilesDirectory(storageRoot)
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return []
      }
      throw error
    },
  )

  for (const entry of entries) {
    throwIfAborted(signal)
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue
    }

    const path = join(directory, entry.name)
    const inspected = await inspectProfileFile(path)
    if (inspected.kind === "profile" && inspected.profile.id === profileId) {
      return path
    }
  }

  return null
}

async function resolveProfilePathForWrite(
  storageRoot: string,
  profileId: string,
  displayName: string,
  signal?: AbortSignal,
): Promise<string> {
  for (let duplicateIndex = 0; ; duplicateIndex += 1) {
    throwIfAborted(signal)
    const candidatePath = resolveProfilePathFromDisplayName(
      storageRoot,
      displayName,
      duplicateIndex,
    )

    const inspected = await inspectProfileFile(candidatePath)
    if (inspected.kind === "missing") {
      return candidatePath
    }
    if (inspected.kind === "profile" && inspected.profile.id === profileId) {
      return candidatePath
    }
  }
}

async function ensureSeedProfile(storageRoot: string): Promise<void> {
  const directory = resolveProfilesDirectory(storageRoot)
  await mkdir(directory, { recursive: true })
  const existingSeedPath = await findProfilePathById(
    storageRoot,
    desktopSeedProfileId,
  )
  if (existingSeedPath !== null) {
    return
  }

  const seed = createSeedProfile()
  const seedPath = await resolveProfilePathForWrite(
    storageRoot,
    seed.id,
    seed.displayName,
  )
  await writeFile(seedPath, JSON.stringify(seed, null, 2), "utf8")
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.")
  }
}

async function readPersistedProfile(
  profilePath: string,
): Promise<PersistedProfile> {
  const raw = await readFile(profilePath, "utf8")
  const parsed = JSON.parse(raw) as PersistedProfile
  const validation = validatePersistedProfile(parsed)
  if (!validation.ok) {
    throw new Error(
      `Invalid persisted profile at ${profilePath}: ${validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    )
  }

  return validation.value
}

export function createDesktopProfileStore(storageRoot: string): ProfileStore {
  return {
    async listProfiles(signal?: AbortSignal) {
      throwIfAborted(signal)
      await ensureSeedProfile(storageRoot)
      throwIfAborted(signal)

      const directory = resolveProfilesDirectory(storageRoot)
      const entries = await readdir(directory, { withFileTypes: true })
      const profiles: PersistedProfile[] = []

      for (const entry of entries) {
        throwIfAborted(signal)
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue
        }

        profiles.push(await readPersistedProfile(join(directory, entry.name)))
      }

      return profiles.filter((profile) => profile.id !== desktopSeedProfileId)
    },
    async loadProfile(profileId: string, signal?: AbortSignal) {
      throwIfAborted(signal)
      await ensureSeedProfile(storageRoot)
      throwIfAborted(signal)

      const profilePath = await findProfilePathById(
        storageRoot,
        profileId,
        signal,
      )
      if (profilePath === null) {
        return null
      }

      return await readPersistedProfile(profilePath)
    },
    async saveProfile(profile: PersistedProfile, signal?: AbortSignal) {
      throwIfAborted(signal)
      const validation = validatePersistedProfile(profile)
      if (!validation.ok) {
        throw new Error(
          `Invalid persisted profile: ${validation.issues
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join("; ")}`,
        )
      }

      await ensureSeedProfile(storageRoot)
      throwIfAborted(signal)

      const profilePath = await resolveProfilePathForWrite(
        storageRoot,
        validation.value.id,
        validation.value.displayName,
        signal,
      )
      const previousPath = await findProfilePathById(
        storageRoot,
        validation.value.id,
        signal,
      )
      await writeFile(
        profilePath,
        JSON.stringify(validation.value, null, 2),
        "utf8",
      )
      if (previousPath !== null && previousPath !== profilePath) {
        await rm(previousPath, { force: true })
      }
      return validation.value
    },
    async deleteProfile(profileId: string, signal?: AbortSignal) {
      throwIfAborted(signal)
      const profilePath = await findProfilePathById(
        storageRoot,
        profileId,
        signal,
      )
      if (profilePath !== null) {
        await rm(profilePath, { force: true })
      }
    },
  }
}
