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

async function loadDesktopProduct(): Promise<() => void> {
  try {
    const product = await import("./desktop-application")
    return product.installDesktopApplication
  } catch (error) {
    return fatalDesktop(error)
  }
}

const installDesktopApplication = await loadDesktopProduct()
try {
  installDesktopApplication()
} catch (error) {
  fatalDesktop(error)
}
