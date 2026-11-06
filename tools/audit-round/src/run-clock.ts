/**
 * Where a measurement starts: the instant it was taken and the waiting the
 * invocation had already done by then, so a later reading subtracts only the
 * waits that fall inside the span.
 */
export type RunMark = {
  readonly instant: number
  readonly waited: number
}

/**
 * The single owner of how much of a runner invocation counts as assistant
 * work. A round measures its assistants, so time the user holds is not the
 * run's own.
 *
 * One clock serves the whole invocation, so a chained run's rounds, its
 * implementation and its close all read the same waiting total. A wait is
 * knowable only when it ends. The assistant's last sign of life opens it and
 * the user's next action closes it, which names the span between them. Every
 * phase, every round and the invocation read that total through their own
 * mark, so one rule serves every elapsed reading.
 */
export class RunClock {
  /** The mark the whole invocation measures from, taken when the clock starts. */
  readonly invocation: RunMark
  private waited = 0
  private lastActivity: number

  constructor(private readonly now: () => number) {
    const started = now()
    this.invocation = { instant: started, waited: 0 }
    this.lastActivity = started
  }

  /** Where a phase or a round begins measuring, carrying the waiting it inherits. */
  mark(): RunMark {
    return { instant: this.now(), waited: this.waited }
  }

  /** An assistant sign of life, which starts the span a user action can claim. */
  active(): void {
    this.lastActivity = this.now()
  }

  /** A user action; the span back to the last sign of life was the user's. */
  awaited(): void {
    const now = this.now()
    this.waited += now - this.lastActivity
    this.lastActivity = now
  }

  /** Assistant time since a mark: its wall clock without the waits inside it. */
  elapsed(mark: RunMark): number {
    return this.now() - mark.instant - (this.waited - mark.waited)
  }
}
