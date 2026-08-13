import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  AppError,
  DiagnosticOutput,
  MilestoneProgress,
  WorkflowCallOptions,
  WorkflowClient,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { createWorkflowClient } from "@repo-edu/application-contract"
import {
  type CliRuntimeProcess,
  createCliWorkflowClientFromBase,
} from "../workflow-runtime.js"

type RuntimeProcessProbe = {
  runtimeProcess: CliRuntimeProcess
  stderrWrites: string[]
  stdoutWrites: string[]
}

function createRuntimeProcessProbe(): RuntimeProcessProbe {
  const stderrWrites: string[] = []
  const stdoutWrites: string[] = []

  const runtimeProcess = {
    stdout: {
      write(chunk: string | Uint8Array) {
        stdoutWrites.push(
          typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
        )
        return true
      },
    },
    stderr: {
      write(chunk: string | Uint8Array) {
        stderrWrites.push(
          typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
        )
        return true
      },
    },
  } satisfies CliRuntimeProcess

  return {
    runtimeProcess,
    stderrWrites,
    stdoutWrites,
  }
}

function createTestCliClient(
  handlers: Partial<WorkflowHandlerMap>,
  defaultSignal?: AbortSignal,
): {
  client: WorkflowClient
  probe: RuntimeProcessProbe
} {
  const probe = createRuntimeProcessProbe()
  const base = createWorkflowClient(handlers as unknown as WorkflowHandlerMap)

  return {
    client: createCliWorkflowClientFromBase(
      base,
      probe.runtimeProcess,
      defaultSignal,
    ),
    probe,
  }
}

describe("cli workflow runtime", () => {
  describe("progress and output routing", () => {
    it("emits progress events to onProgress callback", async () => {
      const progressEvents: MilestoneProgress[] = []

      const { client } = createTestCliClient({
        "course.load": async (
          _input: unknown,
          options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
        ) => {
          options?.onProgress?.({ step: 1, totalSteps: 2, label: "Loading" })
          options?.onProgress?.({ step: 2, totalSteps: 2, label: "Done" })
          return {} as never
        },
      })

      await client.run(
        "course.load",
        { courseId: "c1" },
        { onProgress: (p) => progressEvents.push(p as MilestoneProgress) },
      )

      assert.equal(progressEvents.length, 2)
      assert.equal(progressEvents[0].label, "Loading")
      assert.equal(progressEvents[1].label, "Done")
    })

    it("emits diagnostic output events to onOutput callback", async () => {
      const outputEvents: DiagnosticOutput[] = []

      const { client } = createTestCliClient({
        "course.load": async (
          _input: unknown,
          options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
        ) => {
          options?.onOutput?.({ channel: "info", message: "Loading course." })
          options?.onOutput?.({
            channel: "warn",
            message: "Data may be stale.",
          })
          return {} as never
        },
      })

      await client.run(
        "course.load",
        { courseId: "c1" },
        { onOutput: (o) => outputEvents.push(o as DiagnosticOutput) },
      )

      assert.equal(outputEvents.length, 2)
      assert.equal(outputEvents[0].channel, "info")
      assert.equal(outputEvents[1].channel, "warn")
    })
  })

  describe("cancellation via abort signal", () => {
    it("aborts a running workflow when signal is fired", async () => {
      const controller = new AbortController()

      const { client } = createTestCliClient({
        "course.load": async (
          _input: unknown,
          options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
        ) => {
          if (options?.signal?.aborted) {
            const error: AppError = {
              type: "cancelled",
              message: "Workflow was cancelled.",
            }
            throw error
          }
          return {} as never
        },
      })

      controller.abort()

      await assert.rejects(
        client.run(
          "course.load",
          { courseId: "c1" },
          { signal: controller.signal },
        ),
        (error: unknown) => {
          const err = error as AppError
          assert.equal(err.type, "cancelled")
          return true
        },
      )
    })

    it("supports pre-aborted signal", async () => {
      const controller = new AbortController()
      controller.abort()

      const { client } = createTestCliClient({
        "course.load": async (
          _input: unknown,
          options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
        ) => {
          if (options?.signal?.aborted) {
            const error: AppError = {
              type: "cancelled",
              message: "Workflow was cancelled.",
            }
            throw error
          }
          return {} as never
        },
      })

      await assert.rejects(
        client.run(
          "course.load",
          { courseId: "c1" },
          { signal: controller.signal },
        ),
        (error: unknown) => {
          const err = error as AppError
          assert.equal(err.type, "cancelled")
          return true
        },
      )
    })

    it("uses the command-line host signal when a call has none", async () => {
      const hostAbortController = new AbortController()
      let receivedSignal: AbortSignal | undefined
      const { client } = createTestCliClient(
        {
          "course.load": async (
            _input: unknown,
            options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
          ) => {
            receivedSignal = options?.signal
            await new Promise<void>((_resolve, reject) => {
              options?.signal?.addEventListener(
                "abort",
                () => {
                  const error: AppError = {
                    type: "cancelled",
                    message: "Workflow was cancelled.",
                  }
                  reject(error)
                },
                { once: true },
              )
            })
            return {} as never
          },
        },
        hostAbortController.signal,
      )

      const runPromise = client.run("course.load", { courseId: "c1" })
      hostAbortController.abort()

      await assert.rejects(runPromise, (error: unknown) => {
        const err = error as AppError
        assert.equal(err.type, "cancelled")
        return true
      })
      assert.equal(receivedSignal, hostAbortController.signal)
    })

    it("keeps a caller signal instead of the command-line host signal", async () => {
      const hostAbortController = new AbortController()
      const callerAbortController = new AbortController()
      let receivedSignal: AbortSignal | undefined
      const { client } = createTestCliClient(
        {
          "course.load": async (
            _input: unknown,
            options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
          ) => {
            receivedSignal = options?.signal
            return {} as never
          },
        },
        hostAbortController.signal,
      )

      await client.run(
        "course.load",
        { courseId: "c1" },
        { signal: callerAbortController.signal },
      )

      assert.equal(receivedSignal, callerAbortController.signal)
    })
  })

  describe("workflow error propagation", () => {
    it("propagates provider errors from workflows", async () => {
      const providerError: AppError = {
        type: "provider",
        message: "Canvas API unreachable",
        provider: "canvas",
        operation: "fetchRoster",
        retryable: true,
      }

      const { client } = createTestCliClient({
        "course.load": async () => {
          throw providerError
        },
      })

      await assert.rejects(
        client.run("course.load", { courseId: "c1" }),
        (error: unknown) => {
          const err = error as AppError
          assert.equal(err.type, "provider")
          assert.equal(err.retryable, true)
          return true
        },
      )
    })
  })
})
