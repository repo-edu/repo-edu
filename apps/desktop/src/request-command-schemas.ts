import {
  type DiagnosticOutput,
  type ExclusiveCommandId,
  type ExclusiveRequestOperation,
  type MilestoneProgress,
  workflowInputSchemas,
} from "@repo-edu/application-contract"
import { z } from "zod"
import { commandValueSchemas } from "./request-command-values"
import { examinationOutputSchema } from "./request-examination-schemas"
import {
  type Assert,
  commandSettlementSchema,
  type SchemaMatches,
} from "./request-settlement-schema"

const count = z.number().int().nonnegative()
const channels: Record<DiagnosticOutput["channel"], true> = {
  info: true,
  warn: true,
  stdout: true,
  stderr: true,
}
const progress = z.strictObject({
  step: count,
  totalSteps: count,
  label: z.string(),
})
const diagnosticOutput = z.strictObject({
  channel: z.enum(Object.keys(channels) as DiagnosticOutput["channel"][]),
  message: z.string(),
})
const archiveSettlementInput = z.strictObject({
  summaries: workflowInputSchemas["examination.lookupQuestionSummaries"],
  questions: z.array(workflowInputSchemas["examination.lookupQuestions"]),
})
const noSettlementInput = z.undefined()

function commandOperationSchema<
  K extends ExclusiveCommandId,
  S extends z.core.SomeType,
>(command: K, settlementInput: S) {
  return z.strictObject({
    workflowId: z.literal(command),
    input: workflowInputSchemas[command],
    settlementInput,
  })
}

type _ProgressContract = Assert<
  SchemaMatches<typeof progress, MilestoneProgress>
>
type _DiagnosticOutputContract = Assert<
  SchemaMatches<typeof diagnosticOutput, DiagnosticOutput>
>
// Check each command separately so its input cannot match another command's.
type _OperationContracts = Assert<
  {
    [K in ExclusiveCommandId]: SchemaMatches<
      ReturnType<
        typeof commandOperationSchema<
          K,
          K extends "examination.archive.import"
            ? typeof archiveSettlementInput
            : typeof noSettlementInput
        >
      >,
      ExclusiveRequestOperation<K>
    >
  }[ExclusiveCommandId]
>

export function commandPayloadSchemas(command: ExclusiveCommandId) {
  const { result, authoritative } = commandValueSchemas[command]
  return {
    input: commandOperationSchema(
      command,
      command === "examination.archive.import"
        ? archiveSettlementInput
        : noSettlementInput,
    ),
    progress,
    output:
      command === "examination.generateQuestions"
        ? examinationOutputSchema
        : diagnosticOutput,
    settlement: commandSettlementSchema(command, result, authoritative),
  }
}
