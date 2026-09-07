import {
  CommandOutcomeError,
  createCancelledAppError,
  type ExclusiveBodyClient,
  type ExclusiveCommandClient,
  type ExclusiveCommandId,
  type ExclusiveRequestOperation,
  type ExclusiveTerminalSettlement,
  HostAdmissionRefusedError,
  type WorkflowInput,
  type WorkflowResult,
} from "@repo-edu/application-contract"
import type {
  DesktopRequestBridge,
  RendererRequest,
} from "./preload-request-transport"
import { commandPayloadSchemas } from "./request-command-schemas"
import { createRequestPersistenceExchange } from "./request-persistence"

function pending<T>() {
  const result = Promise.withResolvers<T>()
  void result.promise.catch(() => undefined)
  return result
}

function generationInput(
  input: WorkflowInput<"examination.generateQuestions">,
) {
  const { generationControlId: _control, ...value } = input
  return value
}

function resultOf(
  settlement: ExclusiveTerminalSettlement,
): WorkflowResult<ExclusiveCommandId> {
  const { outcome } = settlement
  switch (outcome.disposition) {
    case "refused":
      throw outcome.error
    case "uncertain":
      throw new CommandOutcomeError(outcome)
    case "stopped":
      if (outcome.result === null) throw createCancelledAppError()
      return outcome.result as WorkflowResult<ExclusiveCommandId>
    case "completed":
      if (outcome.completion.status === "failed") throw outcome.completion.error
      return outcome.completion.result as WorkflowResult<ExclusiveCommandId>
  }
}

/** One invocation encloses the feature body, all publication and host release.
 * A picker may return without ever creating an intent. */
export function createRendererCommandClient(
  bridge: DesktopRequestBridge,
): ExclusiveCommandClient {
  return {
    async runBody(command, preparation, body, settle) {
      let request: RendererRequest | undefined
      const admission = pending<"accepted" | "busy">()
      const prepared = pending<void>()
      const settlement = pending<ExclusiveTerminalSettlement>()
      const released = pending<void>()
      let removeAbort: (() => void) | undefined
      const client: ExclusiveBodyClient = {
        async run(id, capture, options) {
          if (id !== command || request)
            throw new Error(
              "A command body may execute its declared command once.",
            )
          if (options?.signal?.aborted) throw createCancelledAppError()
          const exchange = createRequestPersistenceExchange({
            persist: (bundle) => request!.persist(bundle),
          })
          request = bridge.command(command, {
            admission: admission.resolve,
            prepare() {
              const cancel = () => request!.cancel()
              options?.signal?.addEventListener("abort", cancel, { once: true })
              removeAbort = () =>
                options?.signal?.removeEventListener("abort", cancel)
              if (options?.signal?.aborted) cancel()
              void preparation(exchange.commit).then(
                prepared.resolve,
                (error: unknown) => {
                  prepared.reject(error)
                  request!.fail(
                    error instanceof Error ? error.message : String(error),
                  )
                },
              )
            },
            persisted: exchange.persisted,
            progress: (event) => options?.onProgress?.(event),
            output: (event) => options?.onOutput?.(event as never),
            settlement: (value) => {
              removeAbort?.()
              settlement.resolve(value)
            },
            released: () => released.resolve(),
            closeAcknowledged() {
              throw new Error("Close acknowledgement on command port.")
            },
            failed(message) {
              const error = new Error(message)
              exchange.failed(message)
              admission.reject(error)
              prepared.reject(error)
              settlement.reject(error)
              released.reject(error)
            },
          })
          if ((await admission.promise) === "busy")
            throw new HostAdmissionRefusedError()
          try {
            await prepared.promise
            if (!options?.signal?.aborted) {
              const captured = capture()
              const input =
                id === "examination.generateQuestions"
                  ? generationInput(
                      captured as WorkflowInput<"examination.generateQuestions">,
                    )
                  : captured
              const operation = commandPayloadSchemas(command).input.parse({
                workflowId: command,
                input,
                settlementInput: options?.settlementInput,
              }) as ExclusiveRequestOperation
              request!.prepareInput(operation)
            }
          } catch (error) {
            request!.fail(
              error instanceof Error ? error.message : String(error),
            )
            throw error
          }
          const fixed = await settlement.promise
          if (fixed.authoritative !== undefined) {
            try {
              if (!options?.applyAuthoritative)
                throw new Error(
                  "The command has no authoritative publication owner.",
                )
              await options.applyAuthoritative(fixed.authoritative as never)
            } catch (error) {
              request!.fail(
                error instanceof Error ? error.message : String(error),
              )
              throw error
            }
          }
          return resultOf(fixed) as WorkflowResult<typeof id>
        },
      }
      const outcome = await body(client).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      )
      try {
        await settle()
        if (request && (await admission.promise) === "accepted") {
          await settlement.promise
          request.acknowledgeSettlement()
          await released.promise
        }
      } catch (error) {
        request?.fail(error instanceof Error ? error.message : String(error))
        throw error
      } finally {
        removeAbort?.()
      }
      if (!outcome.ok) throw outcome.error
      return outcome.value
    },
  }
}
