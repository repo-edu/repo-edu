import type {
  CommittedImplementationPlan,
  PlanSourceIdentity,
} from "./contracts.js"
import { readCommittedImplementationPlan } from "./plan-reader.js"

export class PlanSourceAdmissionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "PlanSourceAdmissionError"
  }
}

export async function requireUnchangedPlanSource(
  source: PlanSourceIdentity,
): Promise<void> {
  let current: CommittedImplementationPlan
  try {
    current = await readCommittedImplementationPlan(source.planPath)
  } catch (error) {
    throw new PlanSourceAdmissionError(
      "The committed plan source no longer matches the source fixed at launch.",
      { cause: error },
    )
  }

  if (
    current.source.planName !== source.planName ||
    current.source.planPath !== source.planPath ||
    current.source.blobOid !== source.blobOid
  ) {
    throw new PlanSourceAdmissionError(
      "The committed plan source changed after the run fixed its source blob.",
    )
  }
}
