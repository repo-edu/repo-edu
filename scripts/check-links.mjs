// Checks the symlinks that install the version-controlled tool definitions
// and settings under the home folder. Two questions are answered: does every
// live link into the three sibling repositories still resolve, and has any
// mirrored path been replaced by a regular file, the way an app does when it
// rewrites a settings file in place.
//
// The mirror rules come from `home/README.md`, `home/agents/README.md` and the
// dev-config `README.md`: `home/claude` mirrors `~/.claude`, `home/agents`
// mirrors `~/.agents`, `~/.codex/AGENTS.md` links to the shared `CLAUDE.md`,
// and the dev-config account files and memory store have fixed live paths.

import { readdirSync, readlinkSync, lstatSync, statSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve, relative, isAbsolute } from "node:path"
import { fileURLToPath } from "node:url"

const home = homedir()
const repos = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const plan = join(repos, "plan")
const peers = ["plan", "repo-edu", "dev-config"].map((name) => join(repos, name))
const devConfig = join(repos, "dev-config", "aivm")

// Every mirror is a repository path and the live path that may link to it.
// `required` marks the links the dev-config README says must hold.
const mirrors = [
  ...tree(join(plan, "home", "claude"), join(home, ".claude")),
  ...tree(join(plan, "home", "agents"), join(home, ".agents")),
  { repo: join(plan, "home", "claude", "CLAUDE.md"), live: join(home, ".codex", "AGENTS.md") },
  { repo: join(devConfig, ".claude", "settings.json"), live: join(home, ".claude", "settings.json"), required: true },
  { repo: join(devConfig, ".codex", "config.toml"), live: join(home, ".codex", "config.toml"), required: true },
  ...["plan", "repo-edu"].map((project) => ({
    repo: join(devConfig, ".claude", "memory"),
    live: join(home, ".claude", "projects", `-Users-aivm-repos-${project}`, "memory"),
    required: true,
  })),
]

// Top-level entries of a mirrored folder. Deeper entries are reached only
// when the live folder turns out to be a real directory rather than a link.
function tree(repoDir, liveDir) {
  return readdirSync(repoDir)
    .filter((name) => name.startsWith(".") === false && name !== "README.md")
    .map((name) => ({ repo: join(repoDir, name), live: join(liveDir, name) }))
}

function inPeers(path) {
  return peers.some((peer) => relative(peer, path).startsWith("..") === false)
}

function target(link) {
  const raw = readlinkSync(link)
  return isAbsolute(raw) ? raw : resolve(dirname(link), raw)
}

const findings = { broken: [], overwritten: [], misdirected: [], missing: [], unlinked: [], ok: [] }

function checkMirror({ repo, live, required }) {
  let stat
  try {
    stat = lstatSync(live)
  } catch {
    findings[required ? "missing" : "unlinked"].push(`${live} -> ${repo}`)
    return
  }
  if (stat.isSymbolicLink()) {
    const to = target(live)
    if (existsSync(to) === false) findings.broken.push(`${live} -> ${to}`)
    else if (resolve(to) !== repo) findings.misdirected.push(`${live} -> ${to}, expected ${repo}`)
    else findings.ok.push(live)
    return
  }
  if (stat.isDirectory() && statSync(repo).isDirectory()) {
    for (const child of tree(repo, live)) checkMirror({ ...child, required })
    return
  }
  findings.overwritten.push(`${live} is a regular ${stat.isDirectory() ? "folder" : "file"}; expected a link to ${repo}`)
}

// Any other link into the peer repositories, found by walking the tool
// folders under the home folder, so a link the mirror rules do not know of
// is still reported when it breaks.
const walked = new Set()
function walk(dir, depth) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      const to = target(path)
      if (inPeers(to) && walked.has(path) === false) {
        walked.add(path)
        if (existsSync(to) === false) findings.broken.push(`${path} -> ${to}`)
        else if (mirrors.some((mirror) => mirror.live === path) === false) findings.ok.push(`${path} (unlisted)`)
      }
    } else if (entry.isDirectory() && depth > 0 && entry.name !== "node_modules") {
      walk(path, depth - 1)
    }
  }
}

for (const mirror of mirrors) checkMirror(mirror)
walk(home, 0)
for (const folder of [".claude", ".codex", ".agents", ".config"]) walk(join(home, folder), 3)

const failures = ["broken", "overwritten", "misdirected", "missing"]
for (const kind of failures) for (const line of findings[kind]) console.log(`${kind}: ${line}`)
for (const line of findings.unlinked) console.log(`unlinked: ${line}`)
const failed = failures.reduce((count, kind) => count + findings[kind].length, 0)
console.log(failed === 0 ? `ok: ${findings.ok.length} links` : `${failed} problems, ${findings.ok.length} links ok`)
process.exit(failed === 0 ? 0 : 1)
