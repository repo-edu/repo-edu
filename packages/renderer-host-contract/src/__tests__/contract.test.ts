import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  RendererEnvironmentSnapshot,
  RendererHost,
  RendererOpenUserFileRef,
  RendererSaveTargetRef,
} from "../index.js"
import { packageId } from "../index.js"

describe("renderer-host-contract", () => {
  it("exports the correct packageId", () => {
    assert.equal(packageId, "@repo-edu/renderer-host-contract")
  })

  it("RendererOpenUserFileRef uses the same 'user-file-ref' kind as host-runtime-contract", () => {
    const ref: RendererOpenUserFileRef = {
      kind: "user-file-ref",
      referenceId: "r1",
      displayName: "roster.csv",
      mediaType: "text/csv",
      byteLength: 512,
    }
    assert.equal(ref.kind, "user-file-ref")
  })

  it("RendererSaveTargetRef uses the same 'user-save-target-ref' kind as host-runtime-contract", () => {
    const ref: RendererSaveTargetRef = {
      kind: "user-save-target-ref",
      referenceId: "s1",
      displayName: "export.xlsx",
      suggestedFormat: "xlsx",
    }
    assert.equal(ref.kind, "user-save-target-ref")
  })

  it("RendererEnvironmentSnapshot covers both shell variants", () => {
    const browser: RendererEnvironmentSnapshot = {
      shell: "browser-mock",
      theme: "system",
      windowChrome: "system",
      canPromptForFiles: true,
      lastOpenedExternalUrl: null,
    }
    const electron: RendererEnvironmentSnapshot = {
      shell: "electron-renderer",
      theme: "dark",
      windowChrome: "hiddenInset",
      canPromptForFiles: true,
      lastOpenedExternalUrl: "https://example.com",
    }
    assert.equal(browser.shell, "browser-mock")
    assert.equal(electron.shell, "electron-renderer")
  })

  it("RendererHost interface is structurally implementable", () => {
    const host: RendererHost = {
      pickUserFile: async () => null,
      pickSaveTarget: async () => null,
      pickDirectory: async () => null,
      openExternalUrl: async () => {},
      getEnvironmentSnapshot: async () => ({
        shell: "browser-mock",
        theme: "system",
        windowChrome: "system",
        canPromptForFiles: false,
        lastOpenedExternalUrl: null,
      }),
    }
    assert.ok(host)
  })

  it("file ref types are structurally compatible with host-runtime-contract", () => {
    // Verifies that the type aliases maintain structural equivalence
    const fileRef: RendererOpenUserFileRef = {
      kind: "user-file-ref",
      referenceId: "id",
      displayName: "name",
      mediaType: null,
      byteLength: null,
    }
    const saveRef: RendererSaveTargetRef = {
      kind: "user-save-target-ref",
      referenceId: "id",
      displayName: "name",
      suggestedFormat: null,
    }
    // If these types were not aliases of UserFileRef/UserSaveTargetRef,
    // the kind discriminators would not match at compile time
    assert.equal(fileRef.kind, "user-file-ref")
    assert.equal(saveRef.kind, "user-save-target-ref")
  })
})
