export class CodingEventQueue<T> implements AsyncIterableIterator<T> {
  readonly #pending: T[] = []
  #waiter: ((value: IteratorResult<T>) => void) | undefined
  #closed = false

  push(value: T): void {
    if (this.#closed) return
    const waiter = this.#waiter
    if (waiter === undefined) {
      this.#pending.push(value)
      return
    }
    this.#waiter = undefined
    waiter({ done: false, value })
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    const waiter = this.#waiter
    this.#waiter = undefined
    waiter?.({ done: true, value: undefined })
  }

  next(): Promise<IteratorResult<T>> {
    const value = this.#pending.shift()
    if (value !== undefined) {
      return Promise.resolve({ done: false, value })
    }
    if (this.#closed) {
      return Promise.resolve({ done: true, value: undefined })
    }
    return new Promise((resolve) => {
      this.#waiter = resolve
    })
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this
  }
}
