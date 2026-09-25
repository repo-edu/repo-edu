import type {
  OpenUserFileDialogOptions,
  PickDirectoryOptions,
  RendererOpenUserFileRef,
} from "@repo-edu/renderer-host-contract"
import { useCallback } from "react"
import { useRendererHost } from "../contexts/renderer-host.js"
import { useWorkflowClient } from "../contexts/workflow-client.js"
import type {
  SessionDirectId,
  SessionQueryWorkflowId,
} from "../session/session-operation-inventory.js"
import type {
  SessionOperationGateway,
  SessionOperationScope,
} from "../session/session-operations.js"
import type { SessionStart } from "../session/session-start.js"
import { useToastStore } from "../stores/toast-store.js"
import { getErrorMessage } from "../utils/error-message.js"

/** Report a failure to open a picker. */
export type PickerFailureReport = (message: string) => void

/**
 * A picker request: the host dialog options, plus where a failure is reported.
 *
 * `report` defaults to an error toast, which suits a body whose caller owns no
 * error surface. Pass a setter when the caller already owns an error line that
 * carries its other failures, so one view does not split its failures across
 * two surfaces.
 */
type PickerRequest<HostOptions> = HostOptions & {
  readonly report?: PickerFailureReport
}

/**
 * Apply a picked value, inside the admitted body that opened the picker. The
 * scope comes last so a caller that only sets local state can leave it out.
 */
type PickerApply<T> = (
  picked: T,
  scope: SessionOperationScope,
) => Promise<void> | void

/**
 * Own the envelope every pick-and-apply body shares: admit the body under the
 * picker's operation, stay silent on a cancel and report a failure. The
 * follow-up differs per caller and runs inside the same scope.
 *
 * The reservation names the complete action and owns its stop, so a stop skips
 * a queued picker and discards a pick whose dialog was already open. Each hook
 * names the direct id where it starts its host dialog.
 */
async function runPicker<T>(
  gateway: SessionOperationGateway,
  start: SessionStart,
  id: SessionDirectId | SessionQueryWorkflowId,
  report: PickerFailureReport,
  open: (scope: SessionOperationScope) => Promise<T | null>,
  apply: PickerApply<T>,
): Promise<void> {
  await gateway
    .execute(start, id, async (scope) => {
      try {
        const picked = await open(scope)
        if (picked === null || scope.signal.aborted) return
        await apply(picked, scope)
      } catch (error) {
        report(getErrorMessage(error))
      }
    })
    // Awaited work reports its failure above or in its own error display.
    // Settlement can reject with that same failure after the body retires.
    .catch(() => {})
}

export function useDirectoryPicker(
  operation: "pickDirectory" | SessionQueryWorkflowId = "pickDirectory",
) {
  const gateway = useWorkflowClient()
  const rendererHost = useRendererHost()
  const addToast = useToastStore((state) => state.addToast)

  return useCallback(
    async (
      start: SessionStart,
      request: PickerRequest<PickDirectoryOptions>,
      apply: PickerApply<string>,
    ) => {
      const { report, ...options } = request
      await runPicker(
        gateway,
        start,
        operation,
        report ?? ((message) => addToast(message, { tone: "error" })),
        (scope) =>
          scope.direct("pickDirectory", () =>
            rendererHost.pickDirectory(options),
          ),
        apply,
      )
    },
    [addToast, gateway, operation, rendererHost],
  )
}

export function useUserFilePicker() {
  const gateway = useWorkflowClient()
  const rendererHost = useRendererHost()
  const addToast = useToastStore((state) => state.addToast)

  return useCallback(
    async (
      start: SessionStart,
      request: PickerRequest<OpenUserFileDialogOptions>,
      apply: PickerApply<RendererOpenUserFileRef>,
    ) => {
      const { report, ...options } = request
      await runPicker(
        gateway,
        start,
        "pickUserFile",
        report ?? ((message) => addToast(message, { tone: "error" })),
        (scope) =>
          scope.direct("pickUserFile", () =>
            rendererHost.pickUserFile(options),
          ),
        apply,
      )
    },
    [addToast, gateway, rendererHost],
  )
}
