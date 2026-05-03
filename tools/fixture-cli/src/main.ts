#!/usr/bin/env node
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import {
  defaultFixturesDirFor,
  FixtureError,
  runFixtureCli,
} from "@repo-edu/fixture-engine"

function findWorkspaceRoot(start: string): string | null {
  let dir = resolve(start)
  while (true) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function resolveWorkspaceRoot(): string {
  const explicit = process.env.REDU_WORKSPACE_ROOT
  if (explicit && explicit.length > 0) return resolve(explicit)
  // pnpm sets INIT_CWD to the directory where `pnpm` was invoked; fall back to
  // process.cwd() for direct invocations. Walk upward to find the workspace.
  const initCwd = process.env.INIT_CWD
  const candidates = [initCwd, process.cwd()].filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  )
  for (const candidate of candidates) {
    const root = findWorkspaceRoot(candidate)
    if (root !== null) return root
  }
  process.stderr.write(
    `redu-fixtures: could not locate pnpm-workspace.yaml above ${candidates.join(" or ")}. Run from inside the repo, or set REDU_WORKSPACE_ROOT.\n`,
  )
  process.exit(2)
}

async function main(): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot()
  await runFixtureCli(process.argv.slice(2), {
    workspaceRoot,
    fixturesDir: defaultFixturesDirFor(workspaceRoot),
  })
}

main().catch((err) => {
  if (err instanceof FixtureError) {
    process.stderr.write(`fixture: ${err.message}\n`)
    process.stderr.write("Run with --help for usage.\n")
    process.exit(2)
  }
  process.stderr.write(
    `fixture: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
