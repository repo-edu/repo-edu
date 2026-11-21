import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import * as path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { withProject } from "./fixture-project.js"

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
)

/**
 * Formats text as the repository's `pnpm fix` does, under the root Biome
 * configuration. The engine reprints moved statements and drops layout such
 * as trailing commas and wrapped conditions; the later fix run restores it.
 */
function formatLikeFix(text: string): string {
  return execFileSync(
    process.execPath,
    [
      fileURLToPath(import.meta.resolve("@biomejs/biome/bin/biome")),
      "format",
      "--stdin-file-path=tools/statement-move/src/moved.ts",
    ],
    { cwd: ROOT, input: text, encoding: "utf8" },
  )
}

const LABEL_PREFIX = `const LABEL_PREFIX = "item"`

const BUILD_LABEL = `/** Builds the label shown beside one numbered item of a long listing. */
function buildLabel(
  index: number,
  emphasis: "plain" | "strong",
  separator: string,
): string {
  // The prefix stays in the source file.
  if (
    emphasis === "strong" &&
    separator.length > 0 &&
    index > Number.MAX_SAFE_INTEGER / 2
  ) {
    throw new Error(
      "The item index is too large to label with a strong emphasis marker.",
    )
  }

  return \`\${LABEL_PREFIX}\${separator}\${index}\`
}`

const LABELS = `export const LABELS = [
  buildLabel(1, "plain", "-"),
  buildLabel(2, "strong", ":"),
]`

test("keeps statement bodies byte-equivalent apart from import and export edits", () => {
  withProject(
    {
      "src/labels.ts": `${LABEL_PREFIX}\n\n${BUILD_LABEL}\n\n${LABELS}\n`,
    },
    (project) => {
      const result = project.move("src/labels.ts", 3, 21, "src/label.ts")

      assert.equal(result.kind, "accepted")
      assert.deepEqual(result.fixes, [])
      const target = formatLikeFix(project.read("src/label.ts"))
      assert.equal(
        target,
        `import { LABEL_PREFIX } from "./labels.js"\n\n${BUILD_LABEL.replace(
          "function buildLabel(",
          "export function buildLabel(",
        )}\n`,
      )
      assert.equal(
        formatLikeFix(project.read("src/labels.ts")),
        `import { buildLabel } from "./label.js"\n\nexport ${LABEL_PREFIX}\n\n${LABELS}\n`,
      )
    },
  )
})
