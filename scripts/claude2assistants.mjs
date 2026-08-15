import { globbySync } from "globby"
import { lstatSync, readlinkSync, rmSync, symlinkSync } from "node:fs"
import { dirname, join } from "node:path"

// Ensure every CLAUDE.md has a sibling AGENTS.md symlink pointing at it, so
// other assistants always read current guidance without a copy step. Also
// removes leftovers from the old copy scheme: GEMINI.md files, regular-file
// AGENTS.md copies and AGENTS.md entries whose CLAUDE.md is gone.

const ignore = ["**/.git/**", "**/node_modules/**"]

const claudeDirs = new Set(
  globbySync("**/CLAUDE.md", {
    followSymbolicLinks: false,
    gitignore: true,
    ignore,
  }).map((file) => dirname(file)),
)

const isClaudeLink = (path) => {
  try {
    return lstatSync(path).isSymbolicLink() && readlinkSync(path) === "CLAUDE.md"
  } catch {
    return false
  }
}

// gitignore filtering is off here: AGENTS.md and GEMINI.md are gitignored,
// and they are exactly what this pass must find.
const leftovers = globbySync(["**/AGENTS.md", "**/GEMINI.md"], {
  followSymbolicLinks: false,
  onlyFiles: false,
  ignore,
}).filter(
  (path) =>
    path.endsWith("GEMINI.md") ||
    !claudeDirs.has(dirname(path)) ||
    !isClaudeLink(path),
)

for (const path of leftovers) {
  rmSync(path, { recursive: true })
  console.log(`removed ${path}`)
}

let created = 0
for (const dir of claudeDirs) {
  const linkPath = join(dir, "AGENTS.md")
  if (!isClaudeLink(linkPath)) {
    symlinkSync("CLAUDE.md", linkPath)
    console.log(`linked ${linkPath}`)
    created++
  }
}

console.log(
  `\n${claudeDirs.size} CLAUDE.md files: ${created} links created, ${leftovers.length} leftovers removed`,
)
