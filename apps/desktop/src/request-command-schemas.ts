import {
  type DiagnosticOutput,
  type ExclusiveCommandId,
  workflowInputSchemas,
} from "@repo-edu/application-contract"
import { z } from "zod"
import { commandValueSchemas } from "./request-command-values"
import { examinationOutputSchema } from "./request-examination-schemas"
import { commandSettlementSchema } from "./request-settlement-schema"

const count = z.number().int().nonnegative()
const channels: Record<DiagnosticOutput["channel"], true> = {
  info: true,
  warn: true,
  stdout: true,
  stderr: true,
}

export function commandPayloadSchemas(command: ExclusiveCommandId) {
  const { result, authoritative } = commandValueSchemas[command]
  return {
    input: z.strictObject({
      workflowId: z.literal(command),
      input: workflowInputSchemas[command],
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
            channel: z.enum(
              Object.keys(channels) as DiagnosticOutput["channel"][],
            ),
            message: z.string(),
          }),
    settlement: commandSettlementSchema(command, result, authoritative),
  }
}
