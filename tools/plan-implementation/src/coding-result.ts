import { z } from "zod"
import type { CodingResult } from "./contracts.js"

const commitProposalSchema = z.strictObject({
  subject: z.string().trim().min(1),
  decisionBullets: z.array(z.string().trim().min(1)).min(1),
})

export const codingResultSchema: z.ZodType<CodingResult> = z.discriminatedUnion(
  "status",
  [
    z.strictObject({
      status: z.literal("succeeded"),
      commit: commitProposalSchema,
    }),
    z.strictObject({
      status: z.literal("blocked"),
      reason: z.string().trim().min(1),
    }),
  ],
)

const codingOutputSchema = z.strictObject({ result: codingResultSchema })

export const codingResultJsonSchema = {
  type: "object",
  properties: {
    result: {
      anyOf: [
        {
          type: "object",
          properties: {
            status: { type: "string", enum: ["succeeded"] },
            commit: {
              type: "object",
              properties: {
                subject: { type: "string" },
                decisionBullets: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["subject", "decisionBullets"],
              additionalProperties: false,
            },
          },
          required: ["status", "commit"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            status: { type: "string", enum: ["blocked"] },
            reason: { type: "string" },
          },
          required: ["status", "reason"],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ["result"],
  additionalProperties: false,
} as const

function decodeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch (error) {
    throw new Error("Codex returned invalid JSON for the coding result.", {
      cause: error,
    })
  }
}

export function parseCodingResult(value: string): CodingResult {
  const result = codingResultSchema.safeParse(decodeJson(value))
  if (!result.success) {
    throw new Error("Codex returned an invalid structured coding result.", {
      cause: result.error,
    })
  }
  return result.data
}

export function parseCodingOutput(value: string): CodingResult {
  const output = codingOutputSchema.safeParse(decodeJson(value))
  if (!output.success) {
    throw new Error("Codex returned an invalid structured coding result.", {
      cause: output.error,
    })
  }
  return output.data.result
}
