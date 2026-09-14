import type { SessionTransactionDescriptor } from "./session-reducer.js"

/** What a reservation is for. Work the user asked for keeps its turn until it
 * finishes or the user stops it. Work the owner started on the user's behalf is
 * background: entering any reservation stops it and nothing resumes it by
 * hand. Restart cost decides which of the two a reservation is, and the work
 * owns that choice, never the control that started it: work is background when
 * a later start reaches the same state from the cache. */
export type SessionOperationIntent = "user-asked" | "background"

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

type Settlement = { required: boolean; error: unknown | null }

export class SessionTransactionScope {
  private acceptingDurableOperations = true
  private readonly settlements = new Set<Promise<Settlement>>()

  constructor(
    private readonly mayContinue: () => boolean,
    /** Aborts when this reservation is stopped. Every host call carries it. */
    readonly signal: AbortSignal,
  ) {}

  canContinue(): boolean {
    return this.acceptingDurableOperations && this.mayContinue()
  }

  required<T>(start: () => Promise<T>): Promise<T> {
    return this.issue(start, true)
  }

  tolerated<T>(start: () => Promise<T>): Promise<T> {
    return this.issue(start, false)
  }

  close(): void {
    this.acceptingDurableOperations = false
  }

  async settle(): Promise<void> {
    const outcomes: Settlement[] = []
    // Include follow-up work registered by an admitted asynchronous callback
    // while this drain is awaiting that callback.
    while (outcomes.length < this.settlements.size) {
      outcomes.push(
        ...(await Promise.all([...this.settlements].slice(outcomes.length))),
      )
    }
    const failure = outcomes.find(
      (outcome) => outcome.required && outcome.error !== null,
    )
    if (failure !== undefined) throw failure.error
  }

  private issue<T>(start: () => Promise<T>, required: boolean): Promise<T> {
    if (!this.acceptingDurableOperations) {
      return Promise.reject(
        new Error("The transaction body has already settled."),
      )
    }
    if (!this.mayContinue()) {
      return Promise.reject(
        new Error("The session transaction can no longer continue."),
      )
    }
    let operation: Promise<T>
    try {
      operation = start()
    } catch (error) {
      operation = Promise.reject(error)
    }
    const settlement: Promise<Settlement> = operation.then(
      () => ({ required, error: null }),
      (error: unknown) => ({ required, error }),
    )
    this.settlements.add(settlement)
    return operation
  }
}

type TransactionBody<T> = (scope: SessionTransactionScope) => Promise<T>

export type SessionTransactionReservation<T> = {
  turnId: number
  run(body: TransactionBody<T>): Promise<T>
  /** End this reservation's host work, whether or not its body has started. */
  stop(): void
  cancel(error?: unknown): Promise<T>
}

type LiveReservation = {
  descriptor: SessionTransactionDescriptor
  intent: SessionOperationIntent
  stop: () => void
}

type TransactionCallbacks = {
  enter(turnId: number, descriptor: SessionTransactionDescriptor): boolean
  start(turnId: number, descriptor: SessionTransactionDescriptor): boolean
  canContinue(turnId: number): boolean
  retire(turnId: number): void
}

export class SessionSurfaceTransactions {
  private tail: Promise<void> = Promise.resolve()
  private nextTurnId = 0
  // The reservation, not its body, owns cancellation. An entry lives from
  // admission to retirement, so a queued turn is stoppable before it starts.
  private readonly live = new Map<number, LiveReservation>()

  constructor(private readonly callbacks: TransactionCallbacks) {}

  reserve<T>(
    descriptor: SessionTransactionDescriptor,
    intent: SessionOperationIntent = "user-asked",
  ): SessionTransactionReservation<T> | null {
    const turnId = ++this.nextTurnId
    if (!this.callbacks.enter(turnId, descriptor)) return null
    this.stopBackgroundWork()

    const controller = new AbortController()
    const body = deferred<TransactionBody<T>>()
    let bodySupplied = false
    const supply = (run: TransactionBody<T>): Promise<T> => {
      if (!bodySupplied) {
        bodySupplied = true
        body.resolve(run)
      }
      return result
    }
    const stop = (): void => {
      if (controller.signal.aborted) return
      controller.abort(new Error("The session operation was stopped."))
      // A reservation stopped before its body arrives still drains its turn.
      void supply(async () => {
        throw controller.signal.reason
      }).catch(() => undefined)
    }
    const retire = () => {
      this.live.delete(turnId)
      this.callbacks.retire(turnId)
    }
    const result = this.tail.then(async () => {
      const run = await body.promise
      if (controller.signal.aborted) {
        retire()
        throw controller.signal.reason
      }
      if (!this.callbacks.start(turnId, descriptor)) {
        retire()
        throw new Error(
          "The session transaction was disposed before it started.",
        )
      }

      const scope = new SessionTransactionScope(
        () => this.callbacks.canContinue(turnId),
        controller.signal,
      )
      let value: T | undefined
      let bodyError: unknown | null = null
      try {
        value = await run(scope)
      } catch (error) {
        bodyError = error
      }

      let settlementError: unknown | null = null
      try {
        await scope.settle()
      } catch (error) {
        settlementError = error
      } finally {
        scope.close()
        retire()
      }

      if (bodyError !== null) throw bodyError
      if (settlementError !== null) throw settlementError
      return value as T
    })
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    this.live.set(turnId, { descriptor, intent, stop })

    return {
      turnId,
      run: supply,
      stop,
      cancel: (error = new Error("The session transaction was cancelled.")) =>
        supply(async () => {
          throw error
        }),
    }
  }

  /** Stop every live reservation whose descriptor matches. */
  stopMatching(
    matches: (descriptor: SessionTransactionDescriptor) => boolean,
  ): void {
    for (const reservation of [...this.live.values()]) {
      if (matches(reservation.descriptor)) reservation.stop()
    }
  }

  enqueue<T>(
    descriptor: SessionTransactionDescriptor,
    body: TransactionBody<T>,
  ): Promise<T> {
    const reservation = this.reserve<T>(descriptor)
    if (reservation === null) {
      return Promise.reject(new Error("The session is not accepting commands."))
    }
    return reservation.run(body)
  }

  async flush(): Promise<void> {
    await this.tail
  }

  private stopBackgroundWork(): void {
    for (const reservation of [...this.live.values()]) {
      if (reservation.intent === "background") reservation.stop()
    }
  }
}
