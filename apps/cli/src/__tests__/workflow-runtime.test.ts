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
  sigintHandlers: Array<() => void>
  offCalls: Array<{ event: string; listener: (...args: unknown[]) => void }>
  stderrWrites: string[]
  stdoutWrites: string[]
  exitCodes: number[]
}

function createRuntimeProcessProbe(): RuntimeProcessProbe {
  const sigintHandlers: Array<() => void> = []
  const offCalls: Array<{
    event: string
    listener: (...args: unknown[]) => void
  }> = []
  const stderrWrites: string[] = []
  const stdoutWrites: string[] = []
  const exitCodes: number[] = []

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
    on(event: string, listener: (...args: unknown[]) => void) {
      if (event === "SIGINT") {
        sigintHandlers.push(listener as () => void)
      }
      return process
    },
    off(event: string, listener: (...args: unknown[]) => void) {
      offCalls.push({ event, listener })
      return process
    },
    exit(code?: number) {
      exitCodes.push(code ?? 0)
      return undefined as never
    },
  } as unknown as CliRuntimeProcess

  return {
    runtimeProcess,
    sigintHandlers,
    offCalls,
    stderrWrites,
    stdoutWrites,
    exitCodes,
  }
}

function createTestCliClient(handlers: Partial<WorkflowHandlerMap>): {
  client: WorkflowClient
  probe: RuntimeProcessProbe
} {
  const probe = createRuntimeProcessProbe()
  const base = createWorkflowClient(handlers as unknown as WorkflowHandlerMap)

  return {
    client: createCliWorkflowClientFromBase(base, probe.runtimeProcess),
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

    it("aborts on first SIGINT and exits on second SIGINT", async () => {
      const { client, probe } = createTestCliClient({
        "course.load": async (
          _input: unknown,
          options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
        ) => {
          await new Promise<void>((_resolve, reject) => {
            if (options?.signal?.aborted) {
              const error: AppError = {
                type: "cancelled",
                message: "Workflow was cancelled.",
              }
              reject(error)
              return
            }

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
      })

      const runPromise = client.run("course.load", { courseId: "c1" })
      assert.equal(probe.sigintHandlers.length, 1)

      probe.sigintHandlers[0]()
      probe.sigintHandlers[0]()

      await assert.rejects(runPromise, (error: unknown) => {
        const err = error as AppError
        assert.equal(err.type, "cancelled")
        return true
      })

      assert.deepStrictEqual(probe.exitCodes, [130])
      assert.equal(probe.stderrWrites.includes("\nAborting...\n"), true)
      assert.equal(probe.offCalls.length, 1)
      assert.equal(probe.offCalls[0].event, "SIGINT")
      assert.equal(probe.offCalls[0].listener, probe.sigintHandlers[0])
    })

    it("removes SIGINT handler when base client throws synchronously", () => {
      const probe = createRuntimeProcessProbe()
      const base: WorkflowClient = {
        run: () => {
          throw new Error("sync failure")
        },
      }
      const client = createCliWorkflowClientFromBase(base, probe.runtimeProcess)

      assert.throws(
        () => client.run("course.load", { courseId: "c1" }),
        /sync failure/,
      )

      assert.equal(probe.sigintHandlers.length, 1)
      assert.equal(probe.offCalls.length, 1)
      assert.equal(probe.offCalls[0].event, "SIGINT")
      assert.equal(probe.offCalls[0].listener, probe.sigintHandlers[0])
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
