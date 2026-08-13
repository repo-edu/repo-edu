export class PlanRecordError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PlanRecordError"
  }
}
