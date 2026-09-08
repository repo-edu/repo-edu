import {
  type ExclusiveCommandId,
  exclusiveCommandDeclarations,
  type WorkflowResult,
  workflowInputSchemas,
} from "@repo-edu/application-contract"
import { persistedCourseSchema } from "@repo-edu/domain/schemas"
import { z } from "zod"
import {
  examinationLookupSchema,
  examinationOutputSchema,
  examinationResultSchema,
  examinationSummariesSchema,
} from "./request-examination-schemas"

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
const results = {
  "roster.importFromFile": rosterResult,
  "roster.exportMembers": fileResult,
  "groupSet.importFromFile": persistedCourseSchema,
  "groupSet.export": fileResult,
  "gitUsernames.import": persistedCourseSchema.shape.roster,
  "repo.create": z.strictObject({
    repositoriesPlanned: count,
    repositoriesCreated: count,
    repositoriesAdopted: count,
    repositoriesFailed: count,
    templateCommitShas: z.record(z.string(), z.string()),
    recordedRepositories: repositories,
    completedAt: z.string(),
  }),
  "repo.clone": cloneResult,
  "repo.update": z.strictObject({
    repositoriesPlanned: count,
    prsCreated: count,
    prsSkipped: count,
    prsFailed: count,
    templateCommitSha: z.string().nullable(),
    recordedRepositories: repositories,
    completedAt: z.string(),
  }),
  "repo.bulkClone": cloneResult,
  "userFile.exportPreview": z.strictObject({
    workflowId: z.literal("userFile.exportPreview"),
    displayName: z.string(),
    preview: z.string(),
    savedAt: z.string(),
  }),
  "examination.generateQuestions": examinationResultSchema,
  "examination.archive.export": fileResult.extend({ recordCount: count }),
  "examination.archive.import": z.strictObject({
    totalInBundle: count,
    inserted: count,
    updated: count,
    skipped: count,
    rejected: count,
    rejections: z.array(z.string()),
  }),
} satisfies { [K in ExclusiveCommandId]: z.ZodType<WorkflowResult<K>> }

const resource = z.enum([
  "connection",
  "course",
  "group-set",
  "assignment",
  "repository",
  "file",
])
const failure = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("effect"), message: z.string() }),
  z.strictObject({
    type: z.literal("validation"),
    message: z.string(),
    issues: z.array(
      z.union([
        z.strictObject({ path: z.string(), message: z.string() }),
        z.strictObject({
          kind: z.enum([
            "duplicate_student_id",
            "missing_email",
            "invalid_email",
            "duplicate_email",
            "duplicate_assignment_name",
            "duplicate_group_id_in_assignment",
            "duplicate_group_name_in_assignment",
            "duplicate_repo_name_in_assignment",
            "orphan_group_member",
            "empty_group",
            "system_group_sets_missing",
            "invalid_enrollment_partition",
            "invalid_group_origin",
            "missing_git_username",
            "invalid_git_username",
            "unassigned_student",
            "student_in_multiple_groups_in_assignment",
          ]),
          affectedIds: z.array(z.string()),
          context: z.string().nullable(),
        }),
      ]),
    ),
  }),
  z.strictObject({
    type: z.literal("not-found"),
    message: z.string(),
    resource,
  }),
  z.strictObject({
    type: z.literal("conflict"),
    message: z.string(),
    resource,
    reason: z.string(),
  }),
  z.strictObject({
    type: z.literal("provider"),
    message: z.string(),
    provider: z.enum([
      "canvas",
      "moodle",
      "github",
      "gitlab",
      "gitea",
      "git",
      "llm",
    ]),
    operation: z.string(),
    retryable: z.boolean(),
  }),
])

export function commandPayloadSchemas(command: ExclusiveCommandId) {
  const declaration = exclusiveCommandDeclarations[command]
  const result = results[command]
  return {
    input: z.strictObject({
      workflowId: z.literal(command),
      input:
        command === "examination.generateQuestions"
          ? workflowInputSchemas[command].omit({ generationControlId: true })
          : workflowInputSchemas[command],
      settlementInput:
        command === "examination.archive.import"
          ? z.strictObject({
              summaries:
                workflowInputSchemas["examination.lookupQuestionSummaries"],
              questions: z.array(
                workflowInputSchemas["examination.lookupQuestions"],
              ),
            })
          : z.undefined(),
    }),
    progress: z.strictObject({
      step: count,
      totalSteps: count,
      label: z.string(),
    }),
    output:
      command === "examination.generateQuestions"
        ? examinationOutputSchema
        : z.strictObject({
            channel: z.enum(["info", "warn", "stdout", "stderr"]),
            message: z.string(),
          }),
    settlement: z
      .strictObject({
        workflowId: z.literal(command),
        outcome: z.discriminatedUnion("disposition", [
          z.strictObject({ disposition: z.literal("refused"), error: failure }),
          z.strictObject({
            disposition: z.literal("stopped"),
            result,
          }),
          z.strictObject({
            disposition: z.literal("completed"),
            completion: z.discriminatedUnion("status", [
              z.strictObject({ status: z.literal("succeeded"), result }),
              z.strictObject({
                status: z.literal("failed"),
                error: failure,
                result,
              }),
            ]),
          }),
        ]),
        authoritative:
          declaration.courseTransition === "required"
            ? z.strictObject({ course: persistedCourseSchema })
            : command === "examination.archive.import"
              ? z.strictObject({
                  questionSummaries: examinationSummariesSchema,
                  questions: z.array(examinationLookupSchema),
                })
              : z.undefined(),
      })
      .or(
        z.strictObject({
          workflowId: z.literal(command),
          outcome: z.discriminatedUnion("disposition", [
            z.strictObject({
              disposition: z.literal("refused"),
              error: failure,
            }),
            z.strictObject({
              disposition: z.literal("stopped"),
              result: z.null(),
            }),
            z.strictObject({
              disposition: z.literal("completed"),
              completion: z.strictObject({
                status: z.literal("failed"),
                error: failure,
                result: z.null(),
              }),
            }),
            z.strictObject({
              disposition: z.literal("uncertain"),
              reason: z.literal("confirmation-expired"),
              message: z.string(),
            }),
          ]),
          authoritative: z.undefined(),
        }),
      ),
  }
}
