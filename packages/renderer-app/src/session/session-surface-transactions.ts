import type { SessionTransactionDescriptor } from "./session-reducer.js"

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

  constructor(private readonly mayContinue: () => boolean) {}

  canContinue(): boolean {
    return this.mayContinue()
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
    const outcomes = await Promise.all(this.settlements)
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
  cancel(error?: unknown): Promise<T>
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

  constructor(private readonly callbacks: TransactionCallbacks) {}

  reserve<T>(
    descriptor: SessionTransactionDescriptor,
  ): SessionTransactionReservation<T> | null {
    const turnId = ++this.nextTurnId
    if (!this.callbacks.enter(turnId, descriptor)) return null

    const body = deferred<TransactionBody<T>>()
    let bodySupplied = false
    const result = this.tail.then(async () => {
      const run = await body.promise
      if (!this.callbacks.start(turnId, descriptor)) {
        this.callbacks.retire(turnId)
        throw new Error(
          "The session transaction was disposed before it started.",
        )
      }

      const scope = new SessionTransactionScope(() =>
        this.callbacks.canContinue(turnId),
      )
      let value: T | undefined
      let bodyError: unknown | null = null
      try {
        value = await run(scope)
      } catch (error) {
        bodyError = error
      } finally {
        scope.close()
      }

      let settlementError: unknown | null = null
      try {
        await scope.settle()
      } catch (error) {
        settlementError = error
      } finally {
        this.callbacks.retire(turnId)
      }

      if (bodyError !== null) throw bodyError
      if (settlementError !== null) throw settlementError
      return value as T
    })
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )

    const supply = (run: TransactionBody<T>): Promise<T> => {
      if (!bodySupplied) {
        bodySupplied = true
        body.resolve(run)
      }
      return result
    }

    return {
      turnId,
      run: supply,
      cancel: (error = new Error("The session transaction was cancelled.")) =>
        supply(async () => {
          throw error
        }),
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
}
