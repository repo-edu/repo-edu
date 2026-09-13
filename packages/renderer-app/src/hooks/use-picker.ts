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
 *
 * `signal` belongs to the complete action. A stop skips a queued picker or
 * discards its result if the dialog is already open.
 */
type PickerRequest<HostOptions> = HostOptions & {
  readonly report?: PickerFailureReport
  readonly signal?: AbortSignal
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
 * The reservation names the complete action. Each hook names the direct id
 * where it starts its host dialog.
 */
async function runPicker<T>(
  gateway: SessionOperationGateway,
  id: SessionDirectId | SessionQueryWorkflowId,
  report: PickerFailureReport,
  open: (scope: SessionOperationScope) => Promise<T | null>,
  apply: PickerApply<T>,
  signal?: AbortSignal,
): Promise<void> {
  await gateway
    .execute(id, async (scope) => {
      try {
        if (signal?.aborted) return
        const picked = await open(scope)
        if (picked === null || signal?.aborted) return
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
      request: PickerRequest<PickDirectoryOptions>,
      apply: PickerApply<string>,
    ) => {
      const { report, signal, ...options } = request
      await runPicker(
        gateway,
        operation,
        report ?? ((message) => addToast(message, { tone: "error" })),
        (scope) =>
          scope.direct("pickDirectory", () =>
            rendererHost.pickDirectory(options),
          ),
        apply,
        signal,
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
      request: PickerRequest<OpenUserFileDialogOptions>,
      apply: PickerApply<RendererOpenUserFileRef>,
    ) => {
      const { report, signal, ...options } = request
      await runPicker(
        gateway,
        "pickUserFile",
        report ?? ((message) => addToast(message, { tone: "error" })),
        (scope) =>
          scope.direct("pickUserFile", () =>
            rendererHost.pickUserFile(options),
          ),
        apply,
        signal,
      )
    },
    [addToast, gateway, rendererHost],
  )
}
