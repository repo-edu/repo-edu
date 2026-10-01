import {
  type ExaminationGenerateOutput,
  workflowInputSchemas,
} from "@repo-edu/application-contract"
import type {
  LlmAuthMode,
  LlmEffort,
} from "@repo-edu/integrations-llm-contract"
import { z } from "zod"
import type { Assert, SchemaMatches } from "./request-settlement-schema"

const authModes: Record<LlmAuthMode, true> = { subscription: true, api: true }
const efforts: Record<LlmEffort, true> = {
  none: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
}
const count = z.number().int().nonnegative()
const questions =
  workflowInputSchemas[
    "examination.generateQuestions"
  ].shape.seedQuestions.unwrap()
const range = z.strictObject({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
})
const references = z.array(
  z.strictObject({
    sourceId: z.string(),
    occurrences: z.array(
      z.strictObject({ filePath: z.string(), lineRange: range }),
    ),
  }),
)
const usage = z
  .strictObject({
    inputTokens: count,
    cachedInputTokens: count,
    outputTokens: count,
    reasoningOutputTokens: count,
    wallMs: z.number().nonnegative(),
    authMode: z.enum(Object.keys(authModes) as LlmAuthMode[]),
  })
  .nullable()
const key = z.strictObject({
  personId: z.string(),
  contentScopeId: z.string(),
  questionCount: count,
  providerPayloadFingerprint: z.string(),
  generationContextFingerprint: z.string(),
})
const provenance = z.strictObject({
  model: z.string(),
  effort: z.enum(Object.keys(efforts) as LlmEffort[]),
  questionCount: count,
  usage,
  createdAtMs: z.number(),
  redactionPolicyVersion: count,
  promptTemplateVersion: count,
})

export const examinationResultSchema = z.strictObject({
  key,
  questions,
  usage,
  fromArchive: z.boolean(),
  requestedQuestionCount: count,
  archivedProvenance: provenance,
  sourceReferences: references,
})
export const examinationLookupSchema = z.strictObject({
  requestedKey: key,
  sourceReferences: references,
  exact: examinationResultSchema.nullable(),
  availableSets: z.array(examinationResultSchema),
})
export const examinationSummariesSchema = z.strictObject({
  summaries: z.array(
    z.strictObject({
      subjectId: z.string(),
      sets: z.array(z.strictObject({ key, provenance })),
    }),
  ),
})
export const examinationOutputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("warn"), message: z.string() }),
  z.strictObject({
    kind: z.literal("stream-progress"),
    streamedCharacterCount: count,
    activityLabel: z.string().nullable(),
  }),
  z.strictObject({
    kind: z.literal("partial-questions"),
    acceptedQuestionCount: count,
    questions,
    sourceReferences: references,
  }),
])

type _ExaminationOutputContract = Assert<
  SchemaMatches<typeof examinationOutputSchema, ExaminationGenerateOutput>
>
