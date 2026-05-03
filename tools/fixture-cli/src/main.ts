#!/usr/bin/env node
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import {
  defaultFixturesDirFor,
  FixtureError,
  runFixtureCli,
} from "@repo-edu/fixture-engine"

function resolveWorkspaceRoot(): string {
  // Default to process.cwd(); validate it looks like the repo workspace root
  // by checking for `pnpm-workspace.yaml`. Override with REDU_WORKSPACE_ROOT
  // when invoked from outside the workspace.
  const explicit = process.env.REDU_WORKSPACE_ROOT
  if (explicit && explicit.length > 0) {
    return resolve(explicit)
  }
  const cwd = process.cwd()
  if (!existsSync(resolve(cwd, "pnpm-workspace.yaml"))) {
    process.stderr.write(
      `redu-fixtures: cwd "${cwd}" is not a pnpm workspace root (no pnpm-workspace.yaml). Run from the repo root, or set REDU_WORKSPACE_ROOT.\n`,
    )
    process.exit(2)
  }
  return cwd
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
