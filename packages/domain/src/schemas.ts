import { z } from "zod"
import {
  type PersistedAppSettings,
  persistedAppSettingsSchema,
} from "./settings.js"
import type {
  PersistedAnalysis,
  PersistedCourse,
  ValidationIssue,
  ValidationResult,
} from "./types.js"
import {
  courseKinds,
  enrollmentTypeKinds,
  gitUsernameStatusKinds,
  groupOriginKinds,
  memberStatusKinds,
  persistedAnalysisKind,
  persistedCourseKind,
} from "./types.js"

export const analysisInputsSchema = z.object({
  since: z.string().optional(),
  until: z.string().optional(),
  subfolder: z.string().optional(),
  extensions: z.array(z.string()).optional(),
  includeFiles: z.array(z.string()).optional(),
  excludeFiles: z.array(z.string()).optional(),
  excludeAuthors: z.array(z.string()).optional(),
  excludeEmails: z.array(z.string()).optional(),
  excludeRevisions: z.array(z.string()).optional(),
  excludeMessages: z.array(z.string()).optional(),
  nFiles: z.number().int().min(1).optional(),
  whitespace: z.boolean().optional(),
  blameSkip: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Internal zod schema definitions
// ---------------------------------------------------------------------------

const memberStatusSchema = z.enum(memberStatusKinds)
const gitUsernameStatusSchema = z.enum(gitUsernameStatusKinds)
const enrollmentTypeSchema = z.enum(enrollmentTypeKinds)
const groupOriginSchema = z.enum(groupOriginKinds)
const courseKindSchema = z.enum(courseKinds)
const localMemberIdSchema = z.string().regex(/^m_\d{4,}$/)
const localGroupIdSchema = z.string().regex(/^g_\d{4,}$/)
const localGroupSetIdSchema = z.string().regex(/^gs_\d{4,}$/)

const rosterConnectionSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("canvas"),
      courseId: z.string(),
      lastUpdated: z.string(),
    }),
    z.object({
      kind: z.literal("moodle"),
      courseId: z.string(),
      lastUpdated: z.string(),
    }),
    z.object({
      kind: z.literal("import"),
      sourceFilename: z.string(),
      lastUpdated: z.string(),
    }),
  ])
  .nullable()

const rosterMemberSchema = z.object({
  id: localMemberIdSchema,
  name: z.string(),
  email: z.string(),
  studentNumber: z.string().nullable(),
  gitUsername: z.string().nullable(),
  gitUsernameStatus: gitUsernameStatusSchema,
  status: memberStatusSchema,
  lmsStatus: memberStatusSchema.nullable(),
  lmsUserId: z.string().nullable(),
  enrollmentType: enrollmentTypeSchema,
  enrollmentDisplay: z.string().nullable(),
  department: z.string().nullable(),
  institution: z.string().nullable(),
  source: z.string(),
})

const groupSchema = z.object({
  id: localGroupIdSchema,
  name: z.string(),
  memberIds: z.array(z.string()),
  origin: groupOriginSchema,
  lmsGroupId: z.string().nullable(),
})

const localTeamIdSchema = z.string().regex(/^ut_\d{4,}$/)

const usernameTeamSchema = z.object({
  id: localTeamIdSchema,
  gitUsernames: z.array(z.string().trim().min(1)).nonempty(),
})

const groupSetConnectionSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("system"),
      systemType: z.string(),
    }),
    z.object({
      kind: z.literal("canvas"),
      courseId: z.string(),
      groupSetId: z.string(),
      lastUpdated: z.string(),
    }),
    z.object({
      kind: z.literal("moodle"),
      courseId: z.string(),
      groupingId: z.string(),
      lastUpdated: z.string(),
    }),
    z.object({
      kind: z.literal("import"),
      sourceFilename: z.string(),
      sourcePath: z.string().nullable(),
      lastUpdated: z.string(),
    }),
  ])
  .nullable()

const repositoryTemplateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("remote"),
    owner: z.string(),
    name: z.string(),
    visibility: z.enum(["private", "internal", "public"]),
  }),
  z.object({
    kind: z.literal("local"),
    path: z.string(),
    visibility: z.enum(["private", "internal", "public"]),
  }),
])

const assignmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  groupSetId: localGroupSetIdSchema,
  repositoryTemplate: repositoryTemplateSchema.nullable().optional(),
  templateCommitSha: z.string().nullable().optional(),
  repositories: z.record(z.string(), z.string()).default({}),
})

const groupSetCommon = {
  id: localGroupSetIdSchema,
  name: z.string(),
  connection: groupSetConnectionSchema,
  repoNameTemplate: z.string().nullable().default(null),
  columnVisibility: z.record(z.string(), z.boolean()).default({}),
  columnSizing: z.record(z.string(), z.number()).default({}),
}

const namedGroupSetSchema = z.object({
  ...groupSetCommon,
  nameMode: z.literal("named"),
  groupIds: z.array(localGroupIdSchema),
})

const unnamedGroupSetSchema = z.object({
  ...groupSetCommon,
  nameMode: z.literal("unnamed"),
  teams: z.array(usernameTeamSchema),
})

const groupSetSchema = z
  .discriminatedUnion("nameMode", [namedGroupSetSchema, unnamedGroupSetSchema])
  .superRefine((groupSet, context) => {
    if (
      groupSet.nameMode === "unnamed" &&
      groupSet.repoNameTemplate?.includes("{group}") === true
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repoNameTemplate"],
        message: "The {group} token is not valid for unnamed group sets.",
      })
    }
  })

const rosterSchema = z.object({
  connection: rosterConnectionSchema,
  students: z.array(rosterMemberSchema),
  staff: z.array(rosterMemberSchema),
  groups: z.array(groupSchema),
  groupSets: z.array(groupSetSchema),
  assignments: z.array(assignmentSchema),
})

const idSequencesSchema = z.object({
  nextGroupSeq: z.number().int().positive(),
  nextGroupSetSeq: z.number().int().positive(),
  nextTeamSeq: z.number().int().positive(),
  nextMemberSeq: z.number().int().positive(),
  nextAssignmentSeq: z.number().int().positive(),
})

export const persistedAnalysisSchema = z.object({
  kind: z.literal(persistedAnalysisKind),
  revision: z.number().int().nonnegative(),
  id: z.string(),
  displayName: z.string(),
  searchFolder: z.string().nullable(),
  analysisInputs: analysisInputsSchema,
  updatedAt: z.string(),
})

export const persistedCourseSchema = z.object({
  kind: z.literal(persistedCourseKind),
  courseKind: courseKindSchema,
  revision: z.number().int().nonnegative(),
  id: z.string(),
  displayName: z.string(),
  lmsConnectionName: z.string().nullable(),
  organization: z.string().nullable(),
  lmsCourseId: z.string().nullable(),
  idSequences: idSequencesSchema,
  roster: rosterSchema,
  repositoryTemplate: repositoryTemplateSchema.nullable(),
  repositoryCloneTargetDirectory: z.string().nullable().optional(),
  repositoryCloneDirectoryLayout: z
    .enum(["flat", "by-team", "by-task"])
    .nullable()
    .optional(),
  searchFolder: z.string().nullable(),
  analysisInputs: analysisInputsSchema,
  updatedAt: z.string(),
})

// Compile-time drift guard: ensure zod inferred type matches hand-authored type
type _AnalysisCheck =
  z.infer<typeof persistedAnalysisSchema> extends PersistedAnalysis
    ? PersistedAnalysis extends z.infer<typeof persistedAnalysisSchema>
      ? true
      : never
    : never
const _analysisGuard: _AnalysisCheck = true
void _analysisGuard

type _CourseCheck =
  z.infer<typeof persistedCourseSchema> extends PersistedCourse
    ? PersistedCourse extends z.infer<typeof persistedCourseSchema>
      ? true
      : never
    : never
const _courseGuard: _CourseCheck = true
void _courseGuard

// ---------------------------------------------------------------------------
// Tabular import row schemas (consumed at parse boundary by application workflows)
// ---------------------------------------------------------------------------

export const groupSetImportRowSchema = z.object({
  group_name: z.string().min(1),
  name: z.string().optional(),
  email: z.string().optional(),
  git_username: z.string().optional(),
})

export const groupSetExportRowSchema = z.object({
  group_name: z.string(),
  name: z.string(),
  email: z.string(),
})

export const studentImportRowSchema = z.object({
  name: z.string().min(1),
  id: z.string().optional(),
  email: z.string().optional(),
  student_number: z.string().optional(),
  git_username: z.string().optional(),
  status: z.string().optional(),
  role: z.string().optional(),
})

export type StudentImportRow = z.infer<typeof studentImportRowSchema>

export const gitUsernameImportRowSchema = z.object({
  email: z.string().min(1),
  git_username: z.string().min(1),
})

export type GitUsernameImportRow = z.infer<typeof gitUsernameImportRowSchema>

export const groupEditImportRowSchema = z
  .object({
    group_name: z.string().min(1),
    group_id: z.string().optional(),
    student_id: z.string().optional(),
    student_email: z.string().optional(),
  })
  .refine(
    (row) =>
      (row.student_id !== undefined && row.student_id !== "") ||
      (row.student_email !== undefined && row.student_email !== ""),
    { message: "Either student_id or student_email must be provided." },
  )

export type GroupEditImportRow = z.infer<typeof groupEditImportRowSchema>

// ---------------------------------------------------------------------------
// Boundary validation functions
// ---------------------------------------------------------------------------

function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "$",
    message: issue.message,
  }))
}

export function validatePersistedAppSettings(
  value: unknown,
): ValidationResult<PersistedAppSettings> {
  const result = persistedAppSettingsSchema.safeParse(value)
  if (result.success) {
    return { ok: true, value: result.data }
  }
  return { ok: false, issues: toValidationIssues(result.error) }
}

export function validatePersistedAnalysis(
  value: unknown,
): ValidationResult<PersistedAnalysis> {
  const result = persistedAnalysisSchema.safeParse(value)
  if (result.success) {
    return { ok: true, value: result.data }
  }
  return { ok: false, issues: toValidationIssues(result.error) }
}

export function validatePersistedCourse(
  value: unknown,
): ValidationResult<PersistedCourse> {
  const result = persistedCourseSchema.safeParse(value)
  if (result.success) {
    return { ok: true, value: result.data }
  }
  return { ok: false, issues: toValidationIssues(result.error) }
}

export function formatSmokeWorkflowMessage(source: string) {
  return `Shared workflow executed from ${source}.`
}
