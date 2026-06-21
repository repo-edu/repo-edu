import type { FixtureSelection } from "./fixture-defs.js"
import { fixtureMatrix } from "./fixture-matrix.js"
import type { FixtureRecord } from "./fixture-types.js"

export type {
  FixtureArtifact,
  FixtureMatrix,
  FixtureRecord,
} from "./fixture-types.js"

export function getFixture(selection: FixtureSelection): FixtureRecord {
  return fixtureMatrix[selection.tier][selection.preset]
}
