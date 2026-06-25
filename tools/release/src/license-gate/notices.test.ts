import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  formatNoticeManifest,
  manifestFileName,
  noticeSidecarName,
} from "./notices.js"

describe("notice manifest helpers", () => {
  it("uses app and platform scoped manifest and sidecar names", () => {
    assert.equal(
      manifestFileName("desktop", "darwin-arm64"),
      "RepoEdu-third-party-notices-desktop-darwin-arm64.txt",
    )
    assert.equal(
      noticeSidecarName("redu-linux-x64"),
      "redu-linux-x64.third-party-notices.txt",
    )
  })

  it("formats third-party notices without dynamic first-party listings", () => {
    const manifest = formatNoticeManifest({
      app: "desktop",
      platform: "linux-x64",
      artifactTargets: ["deb"],
      runtimeDecisions: [
        {
          target: "deb",
          decision: "No extra runtime.",
        },
      ],
      entries: [
        {
          id: "left",
          name: "left",
          version: "1.0.0",
          licenseExpression: "MIT",
          kind: "package",
          source: "test",
          licenseText: "MIT text",
        },
      ],
    })

    assert.doesNotMatch(manifest, /@repo-edu\/domain@1.0.0/)
    assert.match(manifest, /root MIT license/)
    assert.match(manifest, /deb: No extra runtime/)
    assert.match(manifest, /left \(1.0.0\)/)
  })
})
