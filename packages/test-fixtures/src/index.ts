import { packageId as domainPackageId } from "@repo-edu/domain/types"

export const packageId = "@repo-edu/test-fixtures"
export const workspaceDependencies = [domainPackageId] as const

export type {
  FixturePreset,
  FixtureSelection,
  FixtureTier,
} from "./fixture-defs.js"
export {
  defaultFixtureSelection,
  fixturePresets,
  fixtureTiers,
  isFixturePreset,
  isFixtureTier,
} from "./fixture-defs.js"

export type {
  FixtureArtifact,
  FixtureMatrix,
  FixtureRecord,
} from "./fixtures.js"
export { getFixture } from "./fixtures.js"
export { validateFixtureMatrix } from "./fixtures-validate.js"
export { buildFixtureMatrix } from "./generator-lib.js"

export type { FixtureSource } from "./source-overlay.js"
export {
  applyFixtureSourceOverlay,
  fixtureSources,
  isFixtureSource,
} from "./source-overlay.js"
