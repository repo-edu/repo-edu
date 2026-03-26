#!/usr/bin/env tsx

import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(new URL(".", import.meta.url).pathname, "..")

const appPaths = [
  resolve(root, "apps/desktop/package.json"),
  resolve(root, "apps/cli/package.json"),
]

function readVersion(path: string): string {
  const pkg = JSON.parse(readFileSync(path, "utf-8"))
  return pkg.version ?? "0.0.0"
}

function writeVersion(path: string, version: string): void {
  const pkg = JSON.parse(readFileSync(path, "utf-8"))
  pkg.version = version
  writeFileSync(path, `${JSON.stringify(pkg, null, 4)}\n`)
}

function bumpVersion(
  current: string,
  part: "major" | "minor" | "patch",
): string {
  const [major, minor, patch] = current.split(".").map(Number)
  switch (part) {
    case "major":
      return `${major + 1}.0.0`
    case "minor":
      return `${major}.${minor + 1}.0`
    case "patch":
      return `${major}.${minor}.${patch + 1}`
  }
}

function run(cmd: string): void {
  console.log(`$ ${cmd}`)
  execSync(cmd, { cwd: root, stdio: "inherit" })
}

function printHelp(): void {
  const current = readVersion(appPaths[0])
  console.log(`Usage: pnpm release <major | minor | patch | x.y.z>

Bumps version in apps/desktop and apps/cli, commits, tags, and pushes.

Current version: ${current}

Examples:
  pnpm release patch    ${current} → ${bumpVersion(current, "patch")}
  pnpm release minor    ${current} → ${bumpVersion(current, "minor")}
  pnpm release major    ${current} → ${bumpVersion(current, "major")}
  pnpm release 1.0.0    ${current} → 1.0.0`)
}

const arg = process.argv[2]
if (!arg || arg === "-h" || arg === "--help") {
  printHelp()
  process.exit(0)
}

const currentVersion = readVersion(appPaths[0])
const bumpParts = ["major", "minor", "patch"] as const
const version = bumpParts.includes(arg as (typeof bumpParts)[number])
  ? bumpVersion(currentVersion, arg as (typeof bumpParts)[number])
  : arg

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version: ${version}`)
  process.exit(1)
}

const tag = `v${version}`

// Check for clean working tree
const status = execSync("git status --porcelain", {
  cwd: root,
  encoding: "utf-8",
}).trim()
if (status) {
  console.error("Working tree is not clean. Commit or stash changes first.")
  process.exit(1)
}

// Check tag doesn't already exist
try {
  execSync(`git rev-parse ${tag}`, { cwd: root, stdio: "ignore" })
  console.error(`Tag ${tag} already exists.`)
  process.exit(1)
} catch {
  // Tag doesn't exist, good
}

console.log("\nRunning release preflight checks...\n")
run("pnpm fmt:check")
run("pnpm check")
run("pnpm test:all")

console.log(`\nBumping ${currentVersion} → ${version}\n`)

for (const path of appPaths) {
  writeVersion(path, version)
  console.log(`Updated ${path.replace(root, ".")}`)
}

run(`git add ${appPaths.map((p) => p.replace(`${root}/`, "")).join(" ")}`)
run(`git commit -m "release: ${tag}"`)
run(`git tag ${tag}`)
run(`git push`)
run(`git push origin ${tag}`)

console.log(
  `\nDone. Trigger the release workflow with:\n  gh workflow run release.yml -f tag=${tag}`,
)
