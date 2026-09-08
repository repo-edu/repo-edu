import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import {
  createSettingsWorkflowHandlers,
  validateExaminationArchiveStorage,
} from "@repo-edu/application"
import {
  createCourseStore,
  createNodeWindowStateStore,
} from "@repo-edu/host-node"
import {
  createExaminationArchiveStorage,
  openExaminationArchiveDatabase,
} from "@repo-edu/host-node/examination-archive"
import { observeDesktopExaminationStorage } from "./desktop-terminal-sources"
import type { HostAdmission } from "./host-admission"
import { createDesktopAppSettingsStore } from "./settings-store"

/** All durable loaders finish before the one renderer session is created. */
export async function loadDesktopBootstrap(
  storageRoot: string,
  admission: HostAdmission,
) {
  const abort = new AbortController()
  const settle = admission.startWorkflow("settings.loadApp", {
    cancel: () => abort.abort(),
  })
  try {
    const appSettingsStore = createDesktopAppSettingsStore(storageRoot)
    const settings = await createSettingsWorkflowHandlers(appSettingsStore)[
      "settings.loadApp"
    ](undefined, { signal: abort.signal })
    const courseStore = createCourseStore(storageRoot)
    // Admission validates every saved row, including courses not selected at startup.
    await courseStore.listCourses()
    const windowStateStore = createNodeWindowStateStore(storageRoot)
    const windowState = await windowStateStore.load()
    abort.signal.throwIfAborted()
    const archiveDirectory = join(storageRoot, "examinations")
    await mkdir(archiveDirectory, { recursive: true })
    abort.signal.throwIfAborted()
    const archiveHandle = openExaminationArchiveDatabase({
      dbPath: join(archiveDirectory, "archive.db"),
    })
    try {
      const examinationArchive = observeDesktopExaminationStorage(
        createExaminationArchiveStorage({ handle: archiveHandle }),
        admission.terminal,
      )
      validateExaminationArchiveStorage(examinationArchive)
      return {
        appSettingsStore,
        settings,
        courseStore,
        windowStateStore,
        windowState,
        archiveHandle,
        examinationArchive,
      }
    } catch (error) {
      archiveHandle.close()
      throw error
    }
  } catch (error) {
    admission.terminal(error)
    throw error
  } finally {
    settle()
  }
}
