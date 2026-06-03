import { globbySync } from "globby"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const BANNER = `<!-- AUTO-GENERATED FROM CLAUDE.md — DO NOT EDIT MANUALLY -->

`

const TARGETS = ["AGENTS.md", "GEMINI.md"]

const files = globbySync("**/CLAUDE.md", {
  followSymbolicLinks: false,
  gitignore: true,
  ignore: ["**/.git/**", "**/node_modules/**"],
})

for (const file of files) {
  const content = readFileSync(file, "utf-8")
  const dir = dirname(file)

  for (const target of TARGETS) {
    const targetPath = join(dir, target)
    const transformed = BANNER + content.replace(/CLAUDE\.md/g, target)
    writeFileSync(targetPath, transformed)
    console.log(targetPath)
  }
}

console.log(`\nCreated ${files.length * TARGETS.length} files from ${files.length} CLAUDE.md sources`)
