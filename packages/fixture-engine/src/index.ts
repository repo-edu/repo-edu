export {
  defaultFixturesDirFor,
  setFixtureRuntimeRoots,
  type FixtureRuntimeRoots,
} from "./constants"
export { FixtureError } from "./log"

import { setFixtureRuntimeRoots } from "./constants"

export async function runFixtureCli(
  argv: string[],
  roots: import("./constants").FixtureRuntimeRoots,
): Promise<void> {
  // Configure runtime roots before any module that consults FIXTURES_DIR /
  // REPO_ROOT loads. The downstream engine modules read the roots when their
  // constants evaluate, so they must be dynamically imported here, after the
  // setter has run.
  setFixtureRuntimeRoots(roots)
  const { runFixtureSubcommand } = await import("./fixture.js")
  await runFixtureSubcommand(argv)
}

export const packageId = "@repo-edu/fixture-engine"
