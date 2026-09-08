import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  CommandFailure,
  CourseChangingCommandId,
  CourseCommandTransition,
  EffectOutcome,
  ExclusiveAdmission,
  ExclusiveAuthoritativeValues,
  ExclusiveCancellation,
  ExclusiveCancellationAction,
  ExclusiveCancellationStage,
  ExclusiveCommandId,
  ExclusiveCommandInput,
  ExclusiveCommandOutput,
  ExclusiveCommandProgress,
  ExclusiveRequestOperation,
  ExclusiveTerminalSettlement,
  KnownCommandCompletion,
  SettledEffectOutcome,
  TerminalStoreFailure,
} from "../index.js"
import {
  exclusiveCancellationActions,
  exclusiveCommandDeclarations,
} from "../index.js"
import { course, file, questionInput } from "./workflow-input-fixtures.js"

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

// These fail compilation when a closed outcome gains an unreviewed variant.
type _Admission = Assert<
  Equal<ExclusiveAdmission["status"], "accepted" | "busy">
>
type _Disposition = Assert<
  Equal<
    EffectOutcome<string>["disposition"],
    "refused" | "stopped" | "completed" | "uncertain"
  >
>
type _Settlement = Assert<
  Equal<
    SettledEffectOutcome<string>["disposition"],
    "refused" | "stopped" | "completed"
  >
>
type _Completion = Assert<
  Equal<KnownCommandCompletion<string>["status"], "succeeded" | "failed">
>
type _Store = Assert<
  Equal<
    TerminalStoreFailure["type"],
    "course-storage" | "settings-storage" | "examination-archive-storage"
  >
>
type _Failure = Assert<
  Equal<
    CommandFailure["type"],
    "validation" | "not-found" | "conflict" | "provider" | "effect"
  >
>
type _EffectValues = Assert<
  Equal<
    ExclusiveAuthoritativeValues<
      Exclude<
        ExclusiveCommandId,
        CourseChangingCommandId | "examination.archive.import"
      >
    >,
    undefined
  >
>
type _Cancel = Assert<Equal<ExclusiveCancellation["type"], "cancel">>
type _Stage = Assert<
  Equal<ExclusiveCancellationStage, "preparing" | "running" | "settling">
>
type _Action = Assert<
  Equal<
    ExclusiveCancellationAction,
    "prevent-effect" | "forward-once" | "ignore"
  >
>

const courseCommands = [
  "roster.importFromFile",
  "groupSet.importFromFile",
  "gitUsernames.import",
  "repo.create",
  "repo.clone",
  "repo.update",
] as const satisfies readonly CourseChangingCommandId[]
const effectCommands = [
  "roster.exportMembers",
  "groupSet.export",
  "repo.bulkClone",
  "userFile.exportPreview",
  "examination.generateQuestions",
  "examination.archive.export",
  "examination.archive.import",
] as const satisfies readonly ExclusiveCommandId[]
type _CourseIds = Assert<
  Equal<(typeof courseCommands)[number], CourseChangingCommandId>
>
type _AllIds = Assert<
  Equal<
    (typeof courseCommands)[number] | (typeof effectCommands)[number],
    ExclusiveCommandId
  >
>

describe("exclusive command contracts", () => {
  it("declares a course transition for each course-changing command only", () => {
    assert.deepEqual(
      Object.keys(exclusiveCommandDeclarations).sort(),
      [...courseCommands, ...effectCommands].sort(),
    )
    for (const id of courseCommands) {
      assert.equal(
        exclusiveCommandDeclarations[id].courseTransition,
        "required",
      )
      const values: ExclusiveAuthoritativeValues<typeof id> = { course }
      assert.equal(values.course.revision, course.revision)
      assert.equal(values.course.updatedAt, course.updatedAt)
      // @ts-expect-error Every course-changing command requires a complete course.
      const missing: ExclusiveAuthoritativeValues<typeof id> = undefined
      void missing
    }
    for (const id of effectCommands) {
      assert.equal(exclusiveCommandDeclarations[id].courseTransition, "none")
    }
  })

  it("declares bounded authoritative reads for archive import", () => {
    assert.deepEqual(
      exclusiveCommandDeclarations["examination.archive.import"]
        .settlementReads,
      ["examination.lookupQuestionSummaries", "examination.lookupQuestions"],
    )
    for (const id of [...courseCommands, ...effectCommands]) {
      if (id !== "examination.archive.import") {
        assert.deepEqual(exclusiveCommandDeclarations[id].settlementReads, [])
      }
    }
    const operation: ExclusiveRequestOperation<"examination.archive.import"> = {
      workflowId: "examination.archive.import",
      input: file,
      settlementInput: { summaries: { subjects: [] }, questions: [] },
    }
    const authoritative: ExclusiveAuthoritativeValues<"examination.archive.import"> =
      { questionSummaries: { summaries: [] }, questions: [] }
    assert.deepEqual(
      operation.settlementInput.summaries.subjects,
      authoritative.questionSummaries.summaries,
    )
    // @ts-expect-error Archive imports require their declared authoritative values.
    const missing: ExclusiveAuthoritativeValues<"examination.archive.import"> =
      undefined
    // @ts-expect-error Effect-only commands cannot publish a course replacement.
    const extra: ExclusiveAuthoritativeValues<"repo.bulkClone"> = { course }
    void missing
    void extra
  })

  it("defines request-local cancellation without a generation identity", () => {
    assert.deepEqual(exclusiveCancellationActions, {
      preparing: "prevent-effect",
      running: "forward-once",
      settling: "ignore",
    })
    const input: ExclusiveCommandInput<"examination.generateQuestions"> =
      questionInput
    const cancellation: ExclusiveCancellation = { type: "cancel" }
    assert.equal(input.questionCount, 3)
    assert.deepEqual(cancellation, { type: "cancel" })
    const legacy: ExclusiveCancellation = {
      type: "cancel",
      // @ts-expect-error The current request authorises cancellation.
      generationControlId: "old",
    }
    void legacy
  })

  it("preserves known failure and stopped partial results without declaring success", () => {
    const outcomes: EffectOutcome<string>[] = [
      {
        disposition: "refused",
        error: { type: "effect", message: "Refused before mutation." },
      },
      { disposition: "stopped", result: "partial" },
      {
        disposition: "completed",
        completion: {
          status: "failed",
          result: "partial",
          error: { type: "effect", message: "Known failure." },
        },
      },
      {
        disposition: "completed",
        completion: { status: "succeeded", result: "complete" },
      },
      {
        disposition: "uncertain",
        reason: "proof-lost",
        message: "Outcome not proven.",
      },
    ]
    assert.deepEqual(
      outcomes.map((value) => value.disposition),
      ["refused", "stopped", "completed", "completed", "uncertain"],
    )
    const settlement: ExclusiveTerminalSettlement<"roster.importFromFile"> = {
      workflowId: "roster.importFromFile",
      outcome: { disposition: "stopped", result: null },
      authoritative: { course },
    }
    assert.equal(settlement.authoritative.course, course)
    const uncertain: SettledEffectOutcome<string> = {
      // @ts-expect-error Uncertainty ends the session and cannot settle it.
      disposition: "uncertain",
      message: "Unknown.",
    }
    const storage: SettledEffectOutcome<string> = {
      disposition: "refused",
      // @ts-expect-error Store failure never becomes an expected effect failure.
      error: { type: "course-storage", message: "Row mismatch." },
    }
    const category: SettledEffectOutcome<string> = {
      // @ts-expect-error Error categories alone cannot prove an effect disposition.
      type: "cancelled",
      message: "Stopped.",
    }
    void uncertain
    void storage
    void category
  })

  it("keeps progress and streamed output correlated with their command", () => {
    const progress: ExclusiveCommandProgress = {
      workflowId: "repo.create",
      progress: { step: 1, totalSteps: 2, label: "Creating" },
    }
    const output: ExclusiveCommandOutput = {
      workflowId: "examination.generateQuestions",
      output: {
        kind: "stream-progress",
        streamedCharacterCount: 10,
        activityLabel: null,
      },
    }
    assert.equal(progress.progress.step, 1)
    assert.equal(output.output.kind, "stream-progress")
    assert.ok(output.output.kind === "stream-progress")
    assert.equal(output.output.streamedCharacterCount, 10)
    const wrong: ExclusiveCommandOutput = {
      workflowId: "repo.create",
      output: {
        // @ts-expect-error Repository commands cannot publish examination output.
        kind: "stream-progress",
        streamedCharacterCount: 10,
        activityLabel: null,
      },
    }
    void wrong
  })
})

// Compile-only proofs. Never mutate a fixture to test a readonly type.
function immutableTransition(
  input: ExclusiveCommandInput<"roster.importFromFile">,
) {
  // @ts-expect-error Prepared input is immutable at every depth.
  input.course.roster.students.push({})
  // @ts-expect-error A transition must compose a complete course, not a patch.
  const partial: CourseCommandTransition<"roster.importFromFile"> = () => ({
    roster: course.roster,
  })
  // @ts-expect-error Effect-only commands cannot own course transitions.
  const effect: CourseCommandTransition<"repo.bulkClone"> = () => course
  void partial
  void effect
}
void immutableTransition
