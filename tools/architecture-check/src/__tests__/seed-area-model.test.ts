import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  compileAreaModel,
  findCoverAreas,
  findPrimaryArea,
  loadAreaModel,
  reconcileAreaModel,
} from "../area-model.js"
import { readSourceInventory } from "../inventory.js"
import { ROOT } from "../repo-paths.js"

describe("seed area model", () => {
  const model = compileAreaModel(loadAreaModel(ROOT))
  const inventory = readSourceInventory(ROOT)

  it("tiles the current source inventory", () => {
    const result = reconcileAreaModel(model, inventory)

    assert.deepEqual(result.violations, [])
  })

  it("assigns the license gate carve-out to its own partition", () => {
    assert.equal(
      findPrimaryArea(model, "tools/release/src/license-gate.ts"),
      "tool-release-license-gate",
    )
    assert.equal(
      findPrimaryArea(model, "tools/release/src/license-gate-cli.ts"),
      "tool-release-license-gate",
    )
    assert.equal(
      findPrimaryArea(model, "tools/release/src/license-gate.test.ts"),
      "tool-release-license-gate",
    )
    assert.equal(
      findPrimaryArea(model, "tools/release/src/license-gate/scanner.ts"),
      "tool-release-license-gate",
    )
  })

  it("covers the analysis workflow seed", () => {
    for (const file of [
      "packages/domain/src/analysis/tokenizer-language-mappings.ts",
      "packages/renderer-app/src/source-tokenizer.ts",
      "packages/tree-sitter-grammar-assets/src/index.ts",
      "apps/docs/src/demo-runtime.ts",
    ]) {
      assert.ok(findCoverAreas(model, file).includes("cover-analysis-workflow"))
    }
  })

  it("covers the examination workflow seed", () => {
    for (const file of [
      "packages/application/src/examination-workflows/examination-workflows.ts",
      "packages/renderer-app/src/components/tabs/ExaminationTab.tsx",
      "packages/renderer-app/src/stores/examination-preferences.ts",
    ]) {
      assert.ok(
        findCoverAreas(model, file).includes("cover-examination-workflow"),
      )
    }
  })

  it("covers the LLM runtime seed", () => {
    for (const file of [
      "packages/domain/src/settings.ts",
      "packages/application-contract/src/workflow-payloads.ts",
      "packages/application-contract/src/examination-contract.ts",
      "packages/host-runtime-contract/src/index.ts",
      "packages/renderer-app/src/stores/credentials-store.ts",
      "packages/renderer-app/src/stores/connections-store.ts",
      "packages/renderer-app/src/components/settings/LlmConnectionsPane.tsx",
      "packages/renderer-app/src/components/tabs/examination/LlmControls.tsx",
      "packages/renderer-app/src/stores/examination-preferences.ts",
      "apps/docs/src/demo-runtime.ts",
      "packages/application/src/llm-connection-workflows.ts",
      "packages/application/src/llm-error-normalization.ts",
    ]) {
      assert.ok(findCoverAreas(model, file).includes("cover-llm-runtime"), file)
    }
  })
})
