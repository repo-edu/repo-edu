import { writeSync } from "node:fs"

// This entry must have no static product imports: they run before this handler.
function fatalDesktop(error: unknown): never {
  try {
    const detail =
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    writeSync(2, `[desktop] fatal ${detail}\n`)
  } finally {
    // No Electron dialog, reducer dispatch or asynchronous cleanup is safe here.
    process.exit(1)
  }
}

process.on("uncaughtException", fatalDesktop)

try {
  const { installDesktopApplication } = await import("./desktop-application")
  installDesktopApplication()
} catch (error) {
  fatalDesktop(error)
}
