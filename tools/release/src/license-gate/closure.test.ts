import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  assertNoForbiddenProductionDependencies,
  enumeratePackageClosureFromList,
  findReachedPackageByReachedName,
} from "./closure.js"
import { reachedPackage, writePackage } from "./test-support.js"
import type { PnpmListNode } from "./types.js"

describe("production dependency enumeration", () => {
  it("exposes productionReached and thirdParty without unsaved root tooling", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      const applicationPath = await writePackage(root, "packages/application", {
        name: "@repo-edu/application",
        version: "1.0.0",
      })
      const domainPath = await writePackage(root, "packages/domain", {
        name: "@repo-edu/domain",
        version: "1.0.0",
      })
      const leftPath = await writePackage(root, "node_modules/left", {
        name: "left",
        version: "1.0.0",
      })
      const sharedPath = await writePackage(root, "node_modules/shared", {
        name: "shared",
        version: "2.0.0",
      })
      const aliasPath = await writePackage(root, "node_modules/alias-target", {
        name: "real-package",
        version: "3.0.0",
      })
      const claudeCoderPath = await writePackage(
        root,
        "packages/claude-coder",
        {
          name: "@repo-edu/claude-coder",
          version: "1.0.0",
        },
      )

      const list: PnpmListNode = {
        name: "@repo-edu/desktop",
        version: "1.0.0",
        path: join(root, "apps/desktop"),
        dependencies: {
          "@repo-edu/application": {
            version: "link:../../packages/application",
            path: applicationPath,
            dependencies: {
              "@repo-edu/domain": {
                version: "link:../../packages/domain",
                path: domainPath,
              },
            },
          },
          left: {
            version: "1.0.0",
            path: leftPath,
            dependencies: {
              shared: {
                version: "2.0.0",
                path: sharedPath,
                dependencies: {},
              },
            },
          },
          "alias-package": {
            version: "3.0.0",
            path: aliasPath,
          },
          "optional-missing": {
            version: "5.0.0",
            path: join(root, "node_modules/optional-missing"),
          },
        },
        unsavedDependencies: {
          "@repo-edu/claude-coder": {
            version: "link:../../packages/claude-coder",
            path: claudeCoderPath,
          },
        },
      }

      const views = enumeratePackageClosureFromList(list, { repoRoot: root })
      assert.deepEqual(
        views.productionReached
          .filter((pkg) => pkg.firstParty)
          .map((pkg) => pkg.packageName)
          .sort(),
        ["@repo-edu/application", "@repo-edu/domain"],
      )
      assert.deepEqual(views.thirdParty.map((pkg) => pkg.reachedName).sort(), [
        "alias-package",
        "left",
        "optional-missing",
        "shared",
      ])
      assert.equal(
        views.thirdParty.find((pkg) => pkg.reachedName === "alias-package")
          ?.packageName,
        "real-package",
      )
      assert.equal(
        views.thirdParty.find((pkg) => pkg.reachedName === "optional-missing")
          ?.packageDirectoryExists,
        false,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("fails closed when production reaches forbidden dev-only packages", () => {
    assert.throws(
      () =>
        assertNoForbiddenProductionDependencies([
          reachedPackage("@repo-edu/claude-coder", {
            firstParty: true,
            packageName: "@repo-edu/claude-coder",
          }),
        ]),
      /Forbidden dev-only package/,
    )
    assert.throws(
      () =>
        assertNoForbiddenProductionDependencies([
          reachedPackage("@repo-edu/test-fixtures", {
            firstParty: true,
            packageName: "@repo-edu/test-fixtures",
          }),
        ]),
      /Forbidden dev-only package/,
    )
  })

  it("records each package once and terminates on a cyclic production graph", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      const aPath = await writePackage(root, "node_modules/a", {
        name: "a",
        version: "1.0.0",
      })
      const bPath = await writePackage(root, "node_modules/b", {
        name: "b",
        version: "1.0.0",
      })

      const list: PnpmListNode = {
        name: "@repo-edu/cyclic-fixture",
        version: "1.0.0",
        path: join(root, "apps/desktop"),
        dependencies: {
          a: {
            version: "1.0.0",
            path: aPath,
            dependencies: {
              b: {
                version: "1.0.0",
                path: bPath,
                dependencies: {
                  a: {
                    version: "1.0.0",
                    path: aPath,
                    deduped: true,
                    dedupedDependenciesCount: 1,
                  },
                },
              },
            },
          },
        },
      }

      const views = enumeratePackageClosureFromList(list, { repoRoot: root })
      assert.deepEqual(views.thirdParty.map((pkg) => pkg.reachedName).sort(), [
        "a",
        "b",
      ])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("finds packages by dependency key without matching aliased package metadata", () => {
    const platformOptional = reachedPackage("@openai/codex-darwin-arm64", {
      packageName: "@openai/codex",
      version: "0.128.0-darwin-arm64",
    })
    const launcher = reachedPackage("@openai/codex", {
      packageName: "@openai/codex",
      version: "0.128.0",
    })

    assert.equal(
      findReachedPackageByReachedName(
        [platformOptional, launcher],
        "@openai/codex",
      )?.version,
      "0.128.0",
    )
  })
})
