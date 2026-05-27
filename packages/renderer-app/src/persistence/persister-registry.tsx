import type { WorkflowClient } from "@repo-edu/application-contract"
import { createContext, type ReactNode, useContext } from "react"
import { createCoursePersister } from "./course-persister.js"
import type { Persister } from "./create-persister.js"
import { createSettingsPersister } from "./settings-persister.js"

export type PersisterRegistry = {
  appSettings: Persister
  course: Persister
  flush: () => Promise<void>
  waitForIdle: () => Promise<void>
  dispose: () => void
}

let currentRegistry: PersisterRegistry | null = null

export function createPersisterRegistry(
  workflowClient: WorkflowClient,
): PersisterRegistry {
  const appSettings = createSettingsPersister(workflowClient)
  const course = createCoursePersister(workflowClient)

  return {
    appSettings,
    course,
    async flush() {
      await Promise.all([appSettings.flush(), course.flush()])
    },
    async waitForIdle() {
      await Promise.all([appSettings.waitForIdle(), course.waitForIdle()])
    },
    dispose() {
      appSettings.dispose()
      course.dispose()
    },
  }
}

export function setPersisterRegistry(registry: PersisterRegistry): void {
  currentRegistry = registry
}

export function clearPersisterRegistry(registry?: PersisterRegistry): void {
  if (registry === undefined || currentRegistry === registry) {
    currentRegistry = null
  }
}

export function getPersisterRegistry(): PersisterRegistry {
  if (currentRegistry === null) {
    throw new Error("Persister registry has not been initialised.")
  }

  return currentRegistry
}

const PersisterRegistryContext = createContext<PersisterRegistry | null>(null)

export function PersisterRegistryProvider({
  registry,
  children,
}: {
  registry: PersisterRegistry
  children: ReactNode
}) {
  return (
    <PersisterRegistryContext.Provider value={registry}>
      {children}
    </PersisterRegistryContext.Provider>
  )
}

export function usePersisterRegistry(): PersisterRegistry {
  const registry = useContext(PersisterRegistryContext)
  if (registry === null) {
    throw new Error("Persister registry has not been initialised.")
  }

  return registry
}
