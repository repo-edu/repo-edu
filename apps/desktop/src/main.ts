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

type FatalDesktopSource =
  | "uncaught-main-process-exception"
  | "rejected-product-composition-import"
  | "thrown-product-installer"

const fatalDesktopSources = {
  "uncaught-main-process-exception": fatalDesktop,
  "rejected-product-composition-import": fatalDesktop,
  "thrown-product-installer": fatalDesktop,
} satisfies Record<FatalDesktopSource, (error: unknown) => never>

process.on(
  "uncaughtException",
  fatalDesktopSources["uncaught-main-process-exception"],
)

async function loadDesktopProduct(): Promise<() => void> {
  try {
    const product = await import("./desktop-application")
    return product.installDesktopApplication
  } catch (error) {
    return fatalDesktopSources["rejected-product-composition-import"](error)
  }
}

const installDesktopApplication = await loadDesktopProduct()
try {
  installDesktopApplication()
} catch (error) {
  fatalDesktopSources["thrown-product-installer"](error)
}
