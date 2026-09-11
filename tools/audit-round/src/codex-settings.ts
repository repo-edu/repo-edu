import { JSONRPCClient } from "json-rpc-2.0"
import { z } from "zod"
import { type CliRuntime, readCliLines, withCliProcess } from "./cli-process.js"
import { type ModelSelection, selectionSchema } from "./feedback.js"

const responseSchema = z.union([
  z
    .object({ id: z.union([z.string(), z.number()]), result: z.unknown() })
    .refine((value) => "result" in value),
  z.object({
    id: z.union([z.string(), z.number(), z.null()]),
    error: z.object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    }),
  }),
])
const configSchema = z.object({
  config: z.object({
    model: z.string().min(1).nullish(),
    model_reasoning_effort: z.string().min(1).nullish(),
  }),
})
const modelsSchema = z.object({
  data: z.array(
    z.object({
      model: z.string().min(1),
      defaultReasoningEffort: z.string().min(1),
      isDefault: z.boolean(),
    }),
  ),
  nextCursor: z.string().nullable(),
})

export async function readCodexSettings(
  runtime: CliRuntime,
  diagnostic: (text: string) => Promise<void>,
): Promise<ModelSelection> {
  return withCliProcess(
    runtime,
    "codex",
    ["app-server"],
    undefined,
    async (child) => {
      const client = new JSONRPCClient(
        (message) =>
          new Promise<void>((resolve, reject) => {
            if (child.stdin === null)
              return reject(new Error("Codex settings input is unavailable"))
            child.stdin.write(
              `${JSON.stringify({ ...message, jsonrpc: undefined })}\n`,
              (error) => (error ? reject(error) : resolve()),
            )
          }),
      )
      const reader = (async () => {
        try {
          await readCliLines(child, "stdout", async (line) => {
            const record = z
              .record(z.string(), z.unknown())
              .parse(JSON.parse(line))
            if ("id" in record && !("method" in record)) {
              client.receive({
                jsonrpc: "2.0",
                ...responseSchema.parse(record),
              })
            } else {
              z.object({ method: z.string() }).parse(record)
              if ("id" in record)
                throw new Error("Unexpected Codex settings server request")
            }
          })
        } finally {
          client.rejectAllPendingRequests(
            "Codex settings stream ended before replying",
          )
        }
      })()
      const selection = (async () => {
        const request = client.timeout(30_000)
        await request.request("initialize", {
          clientInfo: { name: "audit-round-ts", version: "1" },
        })
        await client.send({ jsonrpc: "2.0", method: "initialized" }, undefined)
        const { config } = configSchema.parse(
          await request.request("config/read", {
            cwd: runtime.cwd,
            includeLayers: false,
          }),
        )
        let model = config.model
        let effort = config.model_reasoning_effort
        if (model == null || effort == null) {
          let cursor: string | undefined
          do {
            const page = modelsSchema.parse(
              await request.request("model/list", {
                includeHidden: true,
                ...(cursor === undefined ? {} : { cursor }),
              }),
            )
            const selected = page.data.find((entry) =>
              model == null ? entry.isDefault : entry.model === model,
            )
            if (selected !== undefined) {
              model = selected.model
              effort ??= selected.defaultReasoningEffort
              break
            }
            cursor = page.nextCursor ?? undefined
          } while (cursor !== undefined)
        }
        if (effort == null)
          throw new Error(
            "Codex did not report defaults for the selected model",
          )
        const result = selectionSchema.parse({ model, effort })
        child.stdin?.end()
        return result
      })()
      const [result] = await Promise.all([selection, reader])
      return result
    },
    diagnostic,
  )
}
