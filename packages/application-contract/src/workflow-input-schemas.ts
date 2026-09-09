import {
  connectionBaseSchema,
  gitProviderKinds,
  lmsProviderKinds,
} from "@repo-edu/domain/connection"
import {
  persistedCourseSchema,
  repositoryTemplateSchema,
} from "@repo-edu/domain/schemas"
import {
  persistedAppCredentialsSchema,
  persistedAppPreferencesSchema,
} from "@repo-edu/domain/settings"
import { z } from "zod"
import {
  analysisBlameInputSchema,
  analysisResolveSnapshotHeadInputSchema,
  analysisRunInputSchema,
} from "./analysis-input-schemas.js"
import {
  examinationGenerateQuestionsInputSchema,
  examinationLookupQuestionSummariesInputSchema,
  examinationLookupQuestionsInputSchema,
  examinationPrepareSubmissionSourceInputSchema,
} from "./examination/input-schemas.js"
import {
  userFileRefSchema,
  userSaveTargetRefSchema,
} from "./user-file-schemas.js"
import type { WorkflowId, WorkflowPayloads } from "./workflow-payloads.js"

const course = persistedCourseSchema
const credentials = persistedAppCredentialsSchema
const file = userFileRefSchema
const target = userSaveTargetRefSchema
const courseId = z.strictObject({ courseId: z.string() })
const lmsDraft = connectionBaseSchema.extend({
  provider: z.enum(lmsProviderKinds),
})
const groupSetFileInput = z.strictObject({
  course,
  file,
  format: z.enum(["group-set-csv", "repobee-students"]),
  targetGroupSetId: z.string().nullable(),
})
const repositoryBatchInput = z.strictObject({
  course,
  credentials,
  assignmentId: z.string().nullable(),
  template: repositoryTemplateSchema.nullable(),
  targetDirectory: z.string().optional(),
  directoryLayout: z.enum(["flat", "by-team", "by-task"]).optional(),
})

export type WorkflowInputSchemaMap = {
  [K in WorkflowId]: z.ZodType<WorkflowPayloads[K]["input"]>
}

/** Validate before host classification or dispatch. Admission belongs to the host. */
export const workflowInputSchemas = {
  "course.list": z.undefined(),
  "course.load": courseId,
  "course.save": course,
  "course.delete": courseId,
  "settings.loadApp": z.undefined(),
  "settings.saveCredentials": credentials,
  "settings.savePreferences": persistedAppPreferencesSchema,
  "connection.verifyLmsDraft": lmsDraft,
  "connection.listLmsCoursesDraft": lmsDraft,
  "connection.verifyGitDraft": connectionBaseSchema.extend({
    provider: z.enum(gitProviderKinds),
  }),
  "connection.verifyLlmDraft": z.union([
    z.strictObject({
      provider: z.literal("codex"),
      authMode: z.enum(["api", "subscription"]),
      apiKey: z.string(),
    }),
    z.strictObject({
      provider: z.literal("claude"),
      authMode: z.literal("subscription"),
      apiKey: z.string(),
    }),
    z.strictObject({
      provider: z.literal("claude"),
      authMode: z.literal("api"),
      apiKey: z.string(),
      maxTokens: z.number().int().positive(),
    }),
  ]),
  "roster.importFromFile": z.strictObject({ course, file }),
  "roster.importFromLms": z.strictObject({
    course,
    credentials,
    lmsCourseId: z.string(),
  }),
  "roster.exportMembers": z.strictObject({
    course,
    target,
    format: z.enum(["csv", "xlsx"]),
  }),
  "groupSet.fetchAvailableFromLms": z.strictObject({ course, credentials }),
  "groupSet.connectFromLms": z.strictObject({
    course,
    credentials,
    remoteGroupSetId: z.string(),
  }),
  "groupSet.syncFromLms": z.strictObject({
    course,
    credentials,
    groupSetId: z.string(),
  }),
  "groupSet.previewImportFromFile": groupSetFileInput,
  "groupSet.importFromFile": groupSetFileInput,
  "groupSet.export": z.strictObject({
    course,
    groupSetId: z.string(),
    target,
    format: z.enum(["csv", "txt"]),
  }),
  "gitUsernames.import": z.strictObject({ course, credentials, file }),
  "validation.roster": z.strictObject({ course }),
  "validation.assignment": z.strictObject({ course, assignmentId: z.string() }),
  "repo.create": repositoryBatchInput,
  "repo.clone": repositoryBatchInput,
  "repo.update": z.strictObject({
    course,
    credentials,
    assignmentId: z.string(),
    templateOverride: repositoryTemplateSchema.nullable().optional(),
  }),
  "repo.listNamespace": z.strictObject({
    credentials,
    namespace: z.string(),
    filter: z.string().optional(),
    includeArchived: z.boolean().optional(),
  }),
  "repo.bulkClone": z.strictObject({
    credentials,
    namespace: z.string(),
    repositories: z.array(
      z.strictObject({ name: z.string(), identifier: z.string() }),
    ),
    targetDirectory: z.string(),
  }),
  "userFile.inspectSelection": file,
  "userFile.exportPreview": target,
  "analysis.run": analysisRunInputSchema,
  "analysis.resolveSnapshotHead": analysisResolveSnapshotHeadInputSchema,
  "analysis.blame": analysisBlameInputSchema,
  "analysis.discoverRepos": z.strictObject({
    searchFolder: z.string(),
    maxDepth: z.number().int().nonnegative().optional(),
  }),
  "analysis.listFolderFiles": z.strictObject({
    folderPath: z.string(),
    extensions: z.array(z.string()),
  }),
  "analysis.readFolderFile": z.strictObject({
    folderPath: z.string(),
    relativePath: z.string(),
  }),
  "examination.generateQuestions": examinationGenerateQuestionsInputSchema,
  "examination.lookupQuestions": examinationLookupQuestionsInputSchema,
  "examination.prepareSubmissionSource":
    examinationPrepareSubmissionSourceInputSchema,
  "examination.lookupQuestionSummaries":
    examinationLookupQuestionSummariesInputSchema,
  "examination.archive.export": target,
  "examination.archive.import": file,
} satisfies WorkflowInputSchemaMap
