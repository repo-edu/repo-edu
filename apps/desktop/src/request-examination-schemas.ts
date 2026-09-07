import { workflowInputSchemas } from "@repo-edu/application-contract"
import { z } from "zod"

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
    authMode: z.enum(["subscription", "api"]),
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
  effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]),
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
