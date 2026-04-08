import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  buildEffectiveBlameWorkflowConfig,
  useAnalysisStore,
} from "../stores/analysis-store.js"

beforeEach(() => {
  useAnalysisStore.getState().reset()
})

describe("analysis store", () => {
  it("builds blame workflow config from shared + blame-specific fields", () => {
    const store = useAnalysisStore.getState()
    store.setConfig({
      subfolder: "src",
      extensions: ["ts", "tsx"],
      includeFiles: ["*.ts"],
      excludeFiles: ["*.spec.ts"],
      excludeAuthors: ["bot*"],
      excludeEmails: ["noreply@*"],
      whitespace: true,
      maxConcurrency: 4,
    })
    store.setBlameConfig({
      copyMove: 3,
      includeComments: true,
      includeEmptyLines: true,
      blameExclusions: "show",
      ignoreRevsFile: false,
    })

    const state = useAnalysisStore.getState()
    const merged = buildEffectiveBlameWorkflowConfig(
      state.config,
      state.blameConfig,
    )
    assert.equal(merged.subfolder, "src")
    assert.deepEqual(merged.extensions, ["ts", "tsx"])
    assert.deepEqual(merged.includeFiles, ["*.ts"])
    assert.deepEqual(merged.excludeFiles, ["*.spec.ts"])
    assert.deepEqual(merged.excludeAuthors, ["bot*"])
    assert.deepEqual(merged.excludeEmails, ["noreply@*"])
    assert.equal(merged.whitespace, true)
    assert.equal(merged.maxConcurrency, 4)
    assert.equal(merged.copyMove, 3)
    assert.equal(merged.includeComments, true)
    assert.equal(merged.includeEmptyLines, true)
    assert.equal(merged.blameExclusions, "show")
    assert.equal(merged.ignoreRevsFile, false)
  })

  it("removes closed blame files from targets and cached per-file results", () => {
    const store = useAnalysisStore.getState()
    store.openFileForBlame("src/a.ts")
    store.openFileForBlame("src/b.ts")
    store.setBlameFileResult("src/a.ts", {
      status: "loaded",
      fileBlame: { path: "src/a.ts", lines: [] },
      errorMessage: null,
    })
    store.setBlameFileResult("src/b.ts", {
      status: "loaded",
      fileBlame: { path: "src/b.ts", lines: [] },
      errorMessage: null,
    })

    store.closeBlameTargetFile("src/b.ts")
    const state = useAnalysisStore.getState()
    assert.deepEqual(state.blameTargetFiles, ["src/a.ts"])
    assert.equal(state.activeBlameFile, "src/a.ts")
    assert.equal(state.blameFileResults.has("src/b.ts"), false)
  })

  it("clears blame state when blameSkip is enabled", () => {
    const store = useAnalysisStore.getState()
    store.openFileForBlame("src/a.ts")
    store.setBlameWorkflowStatus("running")
    store.setBlameProgress({
      phase: "blame",
      label: "Running per-file blame.",
      processedFiles: 0,
      totalFiles: 1,
      currentFile: "src/a.ts",
    })
    store.setBlameErrorMessage("x")
    store.setActiveView("blame")

    store.setConfig({ blameSkip: true })

    const state = useAnalysisStore.getState()
    assert.equal(state.config.blameSkip, true)
    assert.deepEqual(state.blameTargetFiles, [])
    assert.equal(state.activeBlameFile, null)
    assert.equal(state.blameWorkflowStatus, "idle")
    assert.equal(state.blameProgress, null)
    assert.equal(state.blameErrorMessage, null)
    assert.equal(state.activeView, "authors")
  })
})
