#!/usr/bin/env tsx

import { cleanupMacosSigning, parseManifestArg } from "./macos-signing.js"

try {
  await cleanupMacosSigning({
    manifestPath: parseManifestArg(process.argv.slice(2)),
  })
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`macos-signing:cleanup: ${message}\n`)
  process.exitCode = 1
}
