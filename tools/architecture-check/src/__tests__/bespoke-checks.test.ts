import assert from "node:assert/strict"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import { runBespokeChecks } from "../bespoke-checks.js"

describe("bespoke checks", () => {
  it("refuses new session helpers that extract or alias course mutations", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-course-actions-"))
    const file = "packages/renderer-app/src/session/unowned-helper.ts"
    await mkdir(join(root, file, ".."), { recursive: true })
    await writeFile(
      join(root, file),
      [
        'import { useCourseStore as store } from "../stores/course-store.js"',
        'const snapshot = store["getState"]()',
        "const alias = snapshot",
        'alias["applyCommittedCourse"](course)',
        'store(s => s["setDisplayName"])',
      ].join("\n"),
    )
    const violations = runBespokeChecks(
      root,
      { files: [file], fileSet: new Set([file]), worktreePaths: [file] },
      () => [file],
    )
    assert.equal(violations.length, 2)
    assert.ok(
      violations.some((v) => v.message.includes("applyCommittedCourse")),
    )
    assert.ok(violations.some((v) => v.message.includes("setDisplayName")))
  })
  it("requires Query publication ownership and a complete mutation body", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-query-bodies-"))
    const file = "packages/renderer-app/src/components/QueryFeature.tsx"
    await mkdir(join(root, file, ".."), { recursive: true })
    await writeFile(
      join(root, file),
      [
        'import { useWorkflowClient } from "../contexts/workflow-client.js"',
        "const client = useWorkflowClient()",
        'useQuery({ queryKey: ["bad"], queryFn: () => fetch() })',
        "mutation.mutateAsync(input)",
        'client.execute("repo.bulkClone", async (scope) => { await mutation.mutateAsync(input) })',
        'useQuery({ queryKey: ["owned"], ...sessionQueryOptions(client, "analysis.run", async (scope) => scope.run("analysis.run", input)) })',
      ].join("\n"),
    )
    const violations = runBespokeChecks(
      root,
      { files: [file], fileSet: new Set([file]), worktreePaths: [file] },
      () => [file],
    )
    assert.equal(violations.length, 2)
    assert.ok(violations.some((entry) => entry.message.includes("Query fetch")))
    assert.ok(
      violations.some((entry) => entry.message.includes("Query mutation")),
    )
  })

  it("rejects unreserved starts in every former direct workflow holder", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-direct-bodies-"))
    const holders = [
      "analysis/analysis-query-coordinator.tsx",
      "hooks/use-courses.ts",
      "components/tabs/groups-assignments/GroupSetGroupsTable/use-clone-all-repositories.ts",
      "components/OpenRepositoriesForm.tsx",
      "components/dialogs/ConnectLmsGroupSetDialog.tsx",
      "components/dialogs/ImportGitUsernamesDialog.tsx",
      "components/dialogs/ImportGroupSetDialog.tsx",
      "components/dialogs/ImportStudentsFromFileDialog.tsx",
      "components/dialogs/StudentSyncDialog.tsx",
      "components/settings/GitConnectionsPane.tsx",
      "components/settings/LlmConnectionsPane.tsx",
      "components/settings/LmsConnectionsPane.tsx",
      "components/tabs/StudentsTab.tsx",
      "components/tabs/SubmissionExaminationTab.tsx",
      "components/tabs/examination/use-examination-engine.ts",
      "components/tabs/groups-assignments/GroupSetGroupsTable/use-repo-operations.ts",
      "utils/export-group-set.ts",
    ].map((file) => `packages/renderer-app/src/${file}`)
    for (const file of holders) {
      await mkdir(join(root, file, ".."), { recursive: true })
      await writeFile(
        join(root, file),
        [
          'import { useWorkflowClient as useGateway } from "../contexts/workflow-client.js"',
          "const gateway = useGateway()",
          "const alias = gateway",
          'alias.run("roster.importFromLms", input).then(publish)',
        ].join("\n"),
      )
    }
    const violations = runBespokeChecks(
      root,
      { files: holders, fileSet: new Set(holders), worktreePaths: holders },
      () => holders,
    )
    assert.deepEqual(
      violations.map((violation) => violation.file).sort(),
      holders.sort(),
    )
    assert.ok(
      violations.every((violation) =>
        violation.message.includes("complete session operation body"),
      ),
    )
  })

  it("admits scoped bodies and presentation while rejecting raw clients and extracted starts", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-direct-bodies-"))
    const file = "packages/renderer-app/src/components/Feature.tsx"
    await mkdir(join(root, file, ".."), { recursive: true })
    await writeFile(
      join(root, file),
      [
        'import type { WorkflowClient as RawClient } from "@repo-edu/application-contract"',
        'import { getWorkflowClient } from "../contexts/workflow-client.js"',
        "const gateway = getWorkflowClient()",
        "const { run: detached } = gateway",
        'gateway.execute("roster.importFromFile", async (scope) => {',
        '  const result = await scope.run("roster.importFromFile", input)',
        "  scope.publish(() => publish(result))",
        "})",
        'gateway.presentation("validation.roster", input)',
      ].join("\n"),
    )
    const violations = runBespokeChecks(
      root,
      { files: [file], fileSet: new Set([file]), worktreePaths: [file] },
      () => [file],
    )
    assert.equal(violations.length, 2)
    assert.ok(
      violations.some((violation) =>
        violation.message.includes("raw WorkflowClient"),
      ),
    )
    assert.ok(
      violations.some((violation) =>
        violation.message.includes("extracts a workflow start"),
      ),
    )
  })

  it("keeps non-source TypeScript files in claude-coder confinement", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-bespoke-"))
    await writeFile(join(root, "package.json"), "{}")
    await mkdir(join(root, "tools/config"), { recursive: true })
    await writeFile(
      join(root, "tools/config/build.ts"),
      'import "@repo-edu/claude-coder"\n',
    )

    const violations = runBespokeChecks(
      root,
      { files: [], fileSet: new Set(), worktreePaths: [] },
      () => ["tools/config/build.ts"],
    )

    assert.match(
      violations.map((violation) => violation.message).join("\n"),
      /outside fixture-engine/,
    )
  })

  it("checks non-source CommonJS and import-equals imports", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-bespoke-"))
    await writeFile(join(root, "package.json"), "{}")
    await mkdir(join(root, "tools/config"), { recursive: true })
    await writeFile(
      join(root, "tools/config/build.ts"),
      [
        'import { createRequire } from "node:module"',
        "const configRequire = createRequire(import.meta.url)",
        'configRequire("@repo-edu/claude-coder")',
      ].join("\n"),
    )
    await writeFile(
      join(root, "tools/config/import-equals.ts"),
      'import coder = require("@repo-edu/claude-coder")\n',
    )

    const violations = runBespokeChecks(
      root,
      { files: [], fileSet: new Set(), worktreePaths: [] },
      () => ["tools/config/build.ts", "tools/config/import-equals.ts"],
    )

    assert.equal(
      violations.filter((violation) =>
        /outside fixture-engine/.test(violation.message),
      ).length,
      2,
    )
  })

  it("checks non-source TypeScript import-type references", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-bespoke-"))
    await writeFile(join(root, "package.json"), "{}")
    await mkdir(join(root, "tools/config"), { recursive: true })
    await writeFile(
      join(root, "tools/config/types.ts"),
      'export type Coder = import("@repo-edu/claude-coder").Coder\n',
    )

    const violations = runBespokeChecks(
      root,
      { files: [], fileSet: new Set(), worktreePaths: [] },
      () => ["tools/config/types.ts"],
    )

    assert.match(
      violations.map((violation) => violation.message).join("\n"),
      /outside fixture-engine/,
    )
  })
})
