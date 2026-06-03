import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { collectBundleInputPaths } from "../license-gate-bundle-inputs.js"

describe("license gate bundle inputs", () => {
  it("records emitted chunk modules and assets but skips tree-shaken modules", () => {
    const inputs = collectBundleInputPaths({
      "main.js": {
        type: "chunk",
        modules: {
          "/repo/apps/desktop/src/main.ts": { renderedLength: 42 },
          "/repo/node_modules/included/index.js?commonjs": {
            renderedLength: 12,
          },
          "/repo/node_modules/tree-shaken/index.js": { renderedLength: 0 },
        },
      },
      "style.css": {
        type: "asset",
        originalFileNames: ["/repo/node_modules/style-package/index.css?used"],
      },
      "ignored.txt": {
        type: "asset",
        originalFileNames: ["virtual:generated"],
      },
    })

    assert.deepEqual(inputs, [
      "/repo/apps/desktop/src/main.ts",
      "/repo/node_modules/included/index.js",
      "/repo/node_modules/style-package/index.css",
    ])
  })
})
