import type { GitProviderKind } from "@repo-edu/domain/connection"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import {
  collectExpectedRepoNames,
  createGitFixture,
  createIntegrationResourcePrefix,
} from "./fixture-adapter.js"
import type { GitProviderHarness } from "./git-provider-harness.js"
import { resolveHarnessesFromEnvironment } from "./provider-matrix.js"

/** The one fixture a run seeds before its test files and removes after them.
 * The Clone, Discover and Update tests read it. The Create command test and
 * the operation tests create what they test under their own prefixes. */
export type RunFixture = {
  harness: GitProviderHarness
  organization: string
  resourcePrefix: string
  course: PersistedCourse
  settings: PersistedAppSettings
  /** The course's first planned student repository, holding the server's
   * initial commit. */
  initialisedRepositoryName: string
  /** The course's second planned student repository, left without a commit. */
  emptyRepositoryName: string
}

const fixtures = new Map<GitProviderKind, RunFixture>()

export function runFixtures(): RunFixture[] {
  return [...fixtures.values()]
}

async function seedRunFixture(
  harness: GitProviderHarness,
): Promise<RunFixture> {
  await harness.ensureReady()
  const resourcePrefix = createIntegrationResourcePrefix()
  const organization = await harness.createOrganization(resourcePrefix)
  let seeded = false
  try {
    const draft = harness.getConnectionDraft()
    const { course, settings } = createGitFixture({
      provider: draft.provider,
      baseUrl: draft.baseUrl,
      token: draft.token,
      organization,
      resourcePrefix,
      fixtureGitUsernames: harness.fixtureGitUsernames,
    })
    const [initialisedRepositoryName, emptyRepositoryName] =
      collectExpectedRepoNames(course, "a1").repoNames
    if (
      initialisedRepositoryName === undefined ||
      emptyRepositoryName === undefined
    ) {
      throw new Error(
        "The product fixture should plan two student repositories.",
      )
    }
    await harness.seedOrganizationRepository(
      organization,
      initialisedRepositoryName,
    )
    await harness.seedOrganizationRepository(
      organization,
      emptyRepositoryName,
      { autoInit: false },
    )
    seeded = true
    return {
      harness,
      organization,
      resourcePrefix,
      course,
      settings,
      initialisedRepositoryName,
      emptyRepositoryName,
    }
  } finally {
    if (!seeded) {
      await harness.cleanupOrganization(organization, resourcePrefix)
    }
  }
}

async function seedRunFixtures(
  harnesses: readonly GitProviderHarness[],
): Promise<void> {
  for (const harness of harnesses) {
    const fixture = await seedRunFixture(harness)
    fixtures.set(fixture.harness.getConnectionDraft().provider, fixture)
  }
}

async function removeRunFixtures(): Promise<void> {
  let firstFailure: unknown
  let failed = false
  for (const fixture of fixtures.values()) {
    try {
      await fixture.harness.cleanupOrganization(
        fixture.organization,
        fixture.resourcePrefix,
      )
    } catch (error) {
      if (!failed) {
        failed = true
        firstFailure = error
      }
    }
  }
  fixtures.clear()
  if (failed) {
    throw firstFailure
  }
}

export async function runWithRunFixtures<T>(
  body: () => Promise<T>,
  harnesses: readonly GitProviderHarness[] = resolveHarnessesFromEnvironment(),
): Promise<T> {
  try {
    await seedRunFixtures(harnesses)
    return await body()
  } finally {
    await removeRunFixtures()
  }
}
