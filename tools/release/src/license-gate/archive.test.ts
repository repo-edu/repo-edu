import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { extractRipgrepVersion, parseDotslashManifest } from "./archive.js"

describe("DotSlash archive helpers", () => {
  it("parses a DotSlash manifest with a shebang prefix", () => {
    const manifest = parseDotslashManifest(`#!/usr/bin/env dotslash

{"name":"rg","platforms":{"linux-x86_64":{"size":1,"hash":"sha256","digest":"abc","format":"tar.gz","path":"ripgrep/rg","providers":[{"url":"https://example.test/rg.tar.gz"}]}}}`)

    assert.equal(manifest.name, "rg")
    assert.equal(manifest.platforms["linux-x86_64"]?.path, "ripgrep/rg")
  })

  it("derives ripgrep version from a DotSlash record", () => {
    assert.equal(
      extractRipgrepVersion(
        {
          size: 1,
          hash: "sha256",
          digest: "abc",
          format: "tar.gz",
          path: "ripgrep-16.2.3-aarch64-apple-darwin/rg",
          providers: [
            {
              url: "https://github.com/BurntSushi/ripgrep/releases/download/16.2.3/ripgrep-16.2.3-aarch64-apple-darwin.tar.gz",
            },
          ],
        },
        "https://github.com/BurntSushi/ripgrep/releases/download/16.2.3/ripgrep-16.2.3-aarch64-apple-darwin.tar.gz",
      ),
      "16.2.3",
    )
    assert.throws(
      () =>
        extractRipgrepVersion(
          {
            size: 1,
            hash: "sha256",
            digest: "abc",
            format: "tar.gz",
            path: "ripgrep-16.2.3-aarch64-apple-darwin/rg",
            providers: [
              {
                url: "https://github.com/BurntSushi/ripgrep/releases/download/16.2.4/ripgrep-16.2.4-aarch64-apple-darwin.tar.gz",
              },
            ],
          },
          "https://github.com/BurntSushi/ripgrep/releases/download/16.2.4/ripgrep-16.2.4-aarch64-apple-darwin.tar.gz",
        ),
      /single ripgrep version/,
    )
  })
})
