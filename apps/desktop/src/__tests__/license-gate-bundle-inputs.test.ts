import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { collectBundleInputTarget } from "../license-gate-bundle-inputs.js"

describe("license gate bundle inputs", () => {
  it("records emitted chunk modules and assets but skips tree-shaken modules", () => {
    const target = collectBundleInputTarget({
      "main.js": {
        type: "chunk",
        dynamicImports: ["@scope/dynamic-package/subpath"],
        imports: [
          "@openai/codex-sdk",
          "electron",
          "lodash/fp.js",
          "main-helper.js",
          "node:fs",
        ],
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
      "worker.js": {
        type: "chunk",
        imports: ["@scope/worker-runtime/index.js"],
        moduleIds: ["/repo/apps/desktop/src/worker.ts"],
      },
    })

    assert.deepEqual(target.inputs, [
      "/repo/apps/desktop/src/main.ts",
      "/repo/apps/desktop/src/worker.ts",
      "/repo/node_modules/included/index.js",
      "/repo/node_modules/style-package/index.css",
    ])
    assert.deepEqual(target.externalImports, [
      "@openai/codex-sdk",
      "@scope/dynamic-package/subpath",
      "@scope/worker-runtime/index.js",
      "electron",
      "lodash/fp.js",
    ])
  })
})
