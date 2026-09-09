import type { PersistedCourse } from "@repo-edu/domain/types"
import type {
  ExaminationLookupQuestionSummariesInput,
  ExaminationLookupQuestionSummariesResult,
  ExaminationLookupQuestionsInput,
  ExaminationLookupQuestionsResult,
} from "./examination/dto.js"
import type { WorkflowInput, WorkflowResult } from "./workflow-client.js"
import type { WorkflowId } from "./workflow-payloads.js"

/** Request semantics only. Desktop admission and Electron transport live elsewhere. */
export type ExclusiveCommandId =
  | "roster.importFromFile"
  | "roster.exportMembers"
  | "groupSet.importFromFile"
  | "groupSet.export"
  | "gitUsernames.import"
  | "repo.create"
  | "repo.clone"
  | "repo.update"
  | "repo.bulkClone"
  | "userFile.exportPreview"
  | "examination.generateQuestions"
  | "examination.archive.export"
  | "examination.archive.import"

/** The ids a hosted surface runs through its ordinary `WorkflowClient`. Exclusive
 * commands travel over their request port instead, which also carries their
 * one cancellation message. */
export type OrdinaryWorkflowId = Exclude<WorkflowId, ExclusiveCommandId>

export type CourseChangingCommandId =
  | "roster.importFromFile"
  | "groupSet.importFromFile"
  | "gitUsernames.import"
  | "repo.create"
  | "repo.clone"
  | "repo.update"

type CommandDeclaration<K extends ExclusiveCommandId> = {
  courseTransition: K extends CourseChangingCommandId ? "required" : "none"
  settlementReads: K extends "examination.archive.import"
    ? readonly [
        "examination.lookupQuestionSummaries",
        "examination.lookupQuestions",
      ]
    : readonly []
}

export const exclusiveCommandDeclarations = {
  "roster.importFromFile": {
    courseTransition: "required",
    settlementReads: [],
  },
  "roster.exportMembers": { courseTransition: "none", settlementReads: [] },
  "groupSet.importFromFile": {
    courseTransition: "required",
    settlementReads: [],
  },
  "groupSet.export": { courseTransition: "none", settlementReads: [] },
  "gitUsernames.import": { courseTransition: "required", settlementReads: [] },
  "repo.create": { courseTransition: "required", settlementReads: [] },
  "repo.clone": { courseTransition: "required", settlementReads: [] },
  "repo.update": { courseTransition: "required", settlementReads: [] },
  "repo.bulkClone": { courseTransition: "none", settlementReads: [] },
  "userFile.exportPreview": { courseTransition: "none", settlementReads: [] },
  "examination.generateQuestions": {
    courseTransition: "none",
    settlementReads: [],
  },
  "examination.archive.export": {
    courseTransition: "none",
    settlementReads: [],
  },
  "examination.archive.import": {
    courseTransition: "none",
    settlementReads: [
      "examination.lookupQuestionSummaries",
      "examination.lookupQuestions",
    ],
  },
} as const satisfies { [K in ExclusiveCommandId]: CommandDeclaration<K> }

export type Immutable<T> = T extends readonly (infer Item)[]
  ? readonly Immutable<Item>[]
  : T extends object
    ? { readonly [K in keyof T]: Immutable<T[K]> }
    : T

/** Captured only after preparation stamps have reached the live owners. */
export type ExclusiveCommandInput<K extends ExclusiveCommandId> = Immutable<
  WorkflowInput<K>
>

export type ExclusiveSettlementInput<K extends ExclusiveCommandId> =
  K extends "examination.archive.import"
    ? Immutable<{
        summaries: ExaminationLookupQuestionSummariesInput
        /** Only the retained source sessions that the import will refresh. */
        questions: ExaminationLookupQuestionsInput[]
      }>
    : undefined

export type ExclusiveRequestOperation<
  K extends ExclusiveCommandId = ExclusiveCommandId,
> = {
  [Id in K]: {
    readonly workflowId: Id
    readonly input: ExclusiveCommandInput<Id>
    readonly settlementInput: ExclusiveSettlementInput<Id>
  }
}[K]

/** Existing workflow results are the official effect values, not course patches. */
export type ExclusiveCommandResult<K extends ExclusiveCommandId> = Immutable<
  WorkflowResult<K>
>

export type ExclusiveAuthoritativeValues<K extends ExclusiveCommandId> =
  K extends CourseChangingCommandId
    ? // This complete committed course includes its revision and updatedAt stamps.
      { readonly course: Immutable<PersistedCourse> }
    : K extends "examination.archive.import"
      ? {
          readonly questionSummaries: Immutable<ExaminationLookupQuestionSummariesResult>
          /** Corresponds to the captured questions queries in the same order. */
          readonly questions: readonly Immutable<ExaminationLookupQuestionsResult>[]
        }
      : undefined

type AssertWorkflowId<T extends WorkflowId> = T
type _ExclusiveWorkflowGuard = AssertWorkflowId<ExclusiveCommandId>
