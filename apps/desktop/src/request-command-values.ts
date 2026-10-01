import type {
  ExclusiveAuthoritativeValues,
  ExclusiveCommandId,
  ExclusiveTerminalSettlement,
  WorkflowResult,
} from "@repo-edu/application-contract"
import { workflowInputSchemas } from "@repo-edu/application-contract"
import { persistedCourseSchema } from "@repo-edu/domain/schemas"
import { z } from "zod"
import {
  examinationLookupSchema,
  examinationResultSchema,
  examinationSummariesSchema,
} from "./request-examination-schemas"
import type {
  Assert,
  commandSettlementSchema,
  SchemaMatches,
} from "./request-settlement-schema"

const count = z.number().int().nonnegative()
const fileResult = z.strictObject({
  file: workflowInputSchemas["userFile.exportPreview"],
})
const rosterResult = z.strictObject({
  roster: persistedCourseSchema.shape.roster,
  idSequences: persistedCourseSchema.shape.idSequences,
})
const repositories = z.record(z.string(), z.record(z.string(), z.string()))
const cloneResult = z.strictObject({
  repositoriesPlanned: count,
  repositoriesCloned: count,
  repositoriesFailed: count,
  recordedRepositories: repositories,
  completedAt: z.string(),
})
const course = z.strictObject({ course: persistedCourseSchema })
const none = z.undefined()
const archive = z.strictObject({
  questionSummaries: examinationSummariesSchema,
  questions: z.array(examinationLookupSchema),
})

export const commandValueSchemas = {
  "roster.importFromFile": { result: rosterResult, authoritative: course },
  "roster.exportMembers": { result: fileResult, authoritative: none },
  "groupSet.importFromFile": {
    result: persistedCourseSchema,
    authoritative: course,
  },
  "groupSet.export": { result: fileResult, authoritative: none },
  "gitUsernames.import": {
    result: persistedCourseSchema.shape.roster,
    authoritative: course,
  },
  "repo.create": {
    result: z.strictObject({
      repositoriesPlanned: count,
      repositoriesCreated: count,
      repositoriesAdopted: count,
      repositoriesFailed: count,
      templateCommitShas: z.record(z.string(), z.string()),
      recordedRepositories: repositories,
      completedAt: z.string(),
    }),
    authoritative: course,
  },
  "repo.clone": { result: cloneResult, authoritative: course },
  "repo.update": {
    result: z.strictObject({
      repositoriesPlanned: count,
      prsCreated: count,
      prsSkipped: count,
      prsFailed: count,
      templateCommitSha: z.string().nullable(),
      recordedRepositories: repositories,
      completedAt: z.string(),
    }),
    authoritative: course,
  },
  "repo.bulkClone": { result: cloneResult, authoritative: none },
  "userFile.exportPreview": {
    result: z.strictObject({
      workflowId: z.literal("userFile.exportPreview"),
      displayName: z.string(),
      preview: z.string(),
      savedAt: z.string(),
    }),
    authoritative: none,
  },
  "examination.generateQuestions": {
    result: examinationResultSchema,
    authoritative: none,
  },
  "examination.archive.export": {
    result: fileResult.extend({ recordCount: count }),
    authoritative: none,
  },
  "examination.archive.import": {
    result: z.strictObject({
      totalInBundle: count,
      inserted: count,
      updated: count,
      skipped: count,
      rejected: count,
      rejections: z.array(z.string()),
    }),
    authoritative: archive,
  },
} satisfies {
  [K in ExclusiveCommandId]: {
    result: z.ZodType<WorkflowResult<K>>
    authoritative: z.ZodType<ExclusiveAuthoritativeValues<K>>
  }
}

// Check each command separately so result and authoritative values stay paired.
type _SettlementContracts = Assert<
  {
    [K in ExclusiveCommandId]: SchemaMatches<
      ReturnType<
        typeof commandSettlementSchema<
          K,
          (typeof commandValueSchemas)[K]["result"],
          (typeof commandValueSchemas)[K]["authoritative"]
        >
      >,
      ExclusiveTerminalSettlement<K>
    >
  }[ExclusiveCommandId]
>
