#!/usr/bin/env tsx

import { pruneLinuxFeedToDeb } from "./linux-feed-prune.js"

function parseReleaseDir(argv: readonly string[]): string {
  const flag = "--release-dir"
  const first = argv[0]
  if (first === flag) {
    const value = argv[1]
    if (!value || value.startsWith("--")) {
      throw new Error("Missing value for --release-dir")
    }
    return value
  }
  if (first?.startsWith(`${flag}=`)) {
    return first.slice(flag.length + 1)
  }
  throw new Error("--release-dir <path> is required")
}

try {
  const releaseDir = parseReleaseDir(process.argv.slice(2))
  const pruned = await pruneLinuxFeedToDeb({ releaseDir })
  for (const feed of pruned) {
    process.stdout.write(`Pruned Linux update feed to deb: ${feed}\n`)
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`linux-feed-prune: ${message}\n`)
  process.exitCode = 1
}
