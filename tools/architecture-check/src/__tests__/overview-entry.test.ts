import assert from "node:assert/strict"
import * as fs from "node:fs"
import { describe, it } from "node:test"

import { ROOT, repoPathToAbsolute } from "../repo-paths.js"

describe("overview entry script", () => {
  it("keeps overview independent from the CI check path", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(
        repoPathToAbsolute(ROOT, "tools/architecture-check/package.json"),
        "utf8",
      ),
    ) as { scripts: Record<string, string> }

    assert.equal(packageJson.scripts.overview, "tsx src/overview.ts")
    assert.equal(packageJson.scripts.start, "pnpm run check && tsx src/main.ts")
  })
})
