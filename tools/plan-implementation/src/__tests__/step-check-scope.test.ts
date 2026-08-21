import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  resolveStepCheckScope,
  type WorkspaceProjectReader,
  type WorkspaceProjectSelection,
} from "../step-check-scope.js"

const repoEduRoot = "/repo-edu"
const allProjects = [
  { name: "repo-edu", path: repoEduRoot },
  {
    name: "@repo-edu/application",
    path: `${repoEduRoot}/packages/application`,
  },
  { name: "@repo-edu/domain", path: `${repoEduRoot}/packages/domain` },
  { name: "@repo-edu/ui", path: `${repoEduRoot}/packages/ui` },
]

function projectOutput(projects: typeof allProjects): string {
  return JSON.stringify(projects)
}

function projectReader(
  selectedProjects: typeof allProjects,
  selections: WorkspaceProjectSelection[] = [],
): WorkspaceProjectReader {
  return async (selection) => {
    selections.push(selection)
    return projectOutput(
      selection.kind === "all" ? allProjects : selectedProjects,
    )
  }
}

describe("step check scope", () => {
  it("selects changed packages and every dependant for tracked and new files", async () => {
    const selections: WorkspaceProjectSelection[] = []

    const scope = await resolveStepCheckScope({
      repoEduRoot,
      admittedPaths: [
        "packages/domain/src/index.ts",
        "packages/domain/src/new-file.ts",
      ],
      finalStep: false,
      readWorkspaceProjects: projectReader(
        [allProjects[1], allProjects[2]],
        selections,
      ),
    })

    assert.deepEqual(scope, {
      kind: "packages",
      changedPackages: [
        {
          name: "@repo-edu/domain",
          relativeRoot: "packages/domain",
        },
      ],
      checkedPackages: [
        {
          name: "@repo-edu/application",
          relativeRoot: "packages/application",
        },
        {
          name: "@repo-edu/domain",
          relativeRoot: "packages/domain",
        },
      ],
    })
    assert.deepEqual(selections, [
      { kind: "all" },
      { kind: "dependants", packageNames: ["@repo-edu/domain"] },
    ])
  })

  it("keeps a lockfile change with each changed package manifest", async () => {
    const scope = await resolveStepCheckScope({
      repoEduRoot,
      admittedPaths: [
        "packages/domain/package.json",
        "packages/ui/package.json",
        "pnpm-lock.yaml",
      ],
      finalStep: false,
      readWorkspaceProjects: projectReader([
        allProjects[1],
        allProjects[2],
        allProjects[3],
      ]),
    })

    assert.equal(scope.kind, "packages")
    if (scope.kind !== "packages") return
    assert.deepEqual(
      scope.changedPackages.map((project) => project.name),
      ["@repo-edu/domain", "@repo-edu/ui"],
    )
  })

  it("selects root checks for unowned paths and removed packages", async () => {
    for (const admittedPaths of [
      ["CLAUDE.md"],
      ["packages/removed/package.json"],
      ["pnpm-lock.yaml"],
    ]) {
      const scope = await resolveStepCheckScope({
        repoEduRoot,
        admittedPaths,
        finalStep: false,
        readWorkspaceProjects: projectReader([]),
      })

      assert.deepEqual(scope, { kind: "root" })
    }
  })

  it("selects root checks when pnpm cannot prove the dependant set", async () => {
    const scope = await resolveStepCheckScope({
      repoEduRoot,
      admittedPaths: ["packages/domain/src/index.ts"],
      finalStep: false,
      readWorkspaceProjects: async (selection) =>
        selection.kind === "all" ? projectOutput(allProjects) : "not json",
    })

    assert.deepEqual(scope, { kind: "root" })
  })

  it("selects root checks for the final step without reading projects", async () => {
    let reads = 0
    const scope = await resolveStepCheckScope({
      repoEduRoot,
      admittedPaths: ["packages/domain/src/index.ts"],
      finalStep: true,
      readWorkspaceProjects: async () => {
        reads += 1
        return projectOutput(allProjects)
      },
    })

    assert.deepEqual(scope, { kind: "root" })
    assert.equal(reads, 0)
  })
})
