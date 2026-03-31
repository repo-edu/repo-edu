import type { WorkflowHandlerMap } from "@repo-edu/application-contract"
import { createFileGroupSetHandlers } from "./group-set-workflows/file-handlers.js"
import { createLmsGroupSetHandlers } from "./group-set-workflows/lms-handlers.js"
import type { GroupSetWorkflowPorts } from "./group-set-workflows/ports.js"

export type { GroupSetWorkflowPorts } from "./group-set-workflows/ports.js"

export function createGroupSetWorkflowHandlers(
  ports: GroupSetWorkflowPorts,
): Pick<
  WorkflowHandlerMap<
    | "groupSet.fetchAvailableFromLms"
    | "groupSet.connectFromLms"
    | "groupSet.syncFromLms"
    | "groupSet.previewImportFromFile"
    | "groupSet.importFromFile"
    | "groupSet.export"
  >,
  | "groupSet.fetchAvailableFromLms"
  | "groupSet.connectFromLms"
  | "groupSet.syncFromLms"
  | "groupSet.previewImportFromFile"
  | "groupSet.importFromFile"
  | "groupSet.export"
> {
  return {
    ...createLmsGroupSetHandlers(ports),
    ...createFileGroupSetHandlers(ports),
  }
}
