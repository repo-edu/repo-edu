import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

// In a packaged build the Codex SDK resolves its native binary through
// node_modules and gets an `app.asar/...` path. Electron redirects `fs` reads
// for unpacked-asar paths but not `child_process.spawn`, so spawning that path
// fails with ENOTDIR. electron-builder unpacks the platform package's native
// payload to `app.asar.unpacked`, so resolve the spawnable binary directly from
// there and hand it to the SDK as `codexPathOverride`.
//
// Layout: <resources>/app.asar.unpacked/node_modules/@openai/codex-<plat>/
//         vendor/<target-triple>/codex/codex[.exe]
// Release artifacts are per-architecture, so exactly one platform package and
// one target-triple directory are unpacked.
export function resolveUnpackedCodexBinaryPath(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const openaiDir = join(
    resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "@openai",
  )
  const binaryName = platform === "win32" ? "codex.exe" : "codex"

  for (const packageName of readDirectoryNames(openaiDir)) {
    if (!packageName.startsWith("codex-")) continue
    const vendorDir = join(openaiDir, packageName, "vendor")
    for (const triple of readDirectoryNames(vendorDir)) {
      const candidate = join(vendorDir, triple, "codex", binaryName)
      if (existsSync(candidate)) return candidate
    }
  }

  return undefined
}

function readDirectoryNames(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}
