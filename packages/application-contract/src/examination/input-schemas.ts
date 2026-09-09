import { persistedLlmConnectionSchema } from "@repo-edu/domain/connection"
import { examinationModelsByProviderSchema } from "@repo-edu/domain/settings"
import { z } from "zod"
import {
  EXAMINATION_QUESTION_COUNT_MAX,
  EXAMINATION_QUESTION_COUNT_MIN,
  SUBMISSION_SELECTION_MAX_FILES,
} from "./constants.js"

export const examinationLocalIdentityContextSchema = z.strictObject({
  names: z.array(z.string()),
  emails: z.array(z.string()),
  opaqueIdentifiers: z.array(z.string()),
  gitUsernames: z.array(z.string()),
})

export const examinationLineRangeSchema = z
  .strictObject({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  })
  .refine(
    (value) => value.end >= value.start,
    "Range end must follow its start.",
  )

export const examinationQuestionSchema = z.strictObject({
  question: z.string(),
  answer: z.string(),
  anchor: z.strictObject({
    sourceId: z.string().nullable(),
    lineRange: examinationLineRangeSchema.nullable(),
  }),
})

const subjectFields = {
  personId: z.string(),
  contentScopeId: z.string(),
  localIdentityContext: examinationLocalIdentityContextSchema,
  excerpts: z.array(
    z.strictObject({
      filePath: z.string(),
      startLine: z.number().int().positive(),
      lines: z.array(z.string()),
    }),
  ),
  excerptFileSources: z.record(z.string(), z.string()),
}

export const examinationLookupQuestionsInputSchema = z.strictObject({
  ...subjectFields,
  questionCount: z
    .number()
    .int()
    .min(EXAMINATION_QUESTION_COUNT_MIN)
    .max(EXAMINATION_QUESTION_COUNT_MAX),
  llmSettings: z.strictObject({
    llmConnections: z.array(persistedLlmConnectionSchema),
    activeLlmConnectionId: z.string().nullable(),
    examinationModelsByProvider: examinationModelsByProviderSchema,
  }),
})

export const examinationGenerateQuestionsInputSchema =
  examinationLookupQuestionsInputSchema.extend({
    seedQuestions: z
      .array(examinationQuestionSchema)
      .max(EXAMINATION_QUESTION_COUNT_MAX)
      .optional(),
    regenerate: z.boolean().optional(),
  })

export const examinationPrepareSubmissionSourceInputSchema = z.strictObject({
  folderPath: z.string(),
  selectedRelativePaths: z
    .array(z.string())
    .max(SUBMISSION_SELECTION_MAX_FILES),
  configuredExtensions: z.array(z.string()),
  attachedRosterIdentities: z
    .array(
      z.strictObject({
        name: z.string().nullable(),
        email: z.string().nullable(),
        id: z.string().nullable(),
        lmsUserId: z.string().nullable(),
        studentNumber: z.string().nullable(),
        gitUsername: z.string().nullable(),
      }),
    )
    .optional(),
})

export const examinationLookupQuestionSummariesInputSchema = z.strictObject({
  subjects: z.array(
    z.strictObject({ subjectId: z.string(), ...subjectFields }),
  ),
})
