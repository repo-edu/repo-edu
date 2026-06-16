#!/usr/bin/env tsx

import { parseManifestArg, prepareMacosSigning } from "./macos-signing.js"

try {
  await prepareMacosSigning({
    manifestPath: parseManifestArg(process.argv.slice(2)),
  })
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`macos-signing:prepare: ${message}\n`)
  process.exitCode = 1
}
