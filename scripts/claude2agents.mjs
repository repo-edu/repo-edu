import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { globbySync } from "globby"

const files = globbySync("**/CLAUDE.md", { gitignore: true }).filter(
  (file) => file !== "CLAUDE.md"
)

for (const file of files) {
  const content = readFileSync(file, "utf-8")
  const agentsPath = join(dirname(file), "AGENTS.md")
  writeFileSync(agentsPath, content.replace(/CLAUDE\.md/g, "AGENTS.md"))
  console.log(agentsPath)
}

console.log(`\nCreated ${files.length} AGENTS.md files`)
