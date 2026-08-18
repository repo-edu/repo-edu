import { PendingLaunchStoppedError } from "./child-process-lifetime-contract.js"

export type LaunchStopSignals = readonly (AbortSignal | undefined)[]

export function launchStopRequested(signals: LaunchStopSignals): boolean {
  return signals.some((signal) => signal?.aborted === true)
}

export function pendingLaunchStoppedError(
  signal?: AbortSignal,
): PendingLaunchStoppedError {
  return new PendingLaunchStoppedError(signal)
}

export function throwIfLaunchStopRequested(signals: LaunchStopSignals): void {
  const stoppedSignal = signals.find((signal) => signal?.aborted === true)
  if (stoppedSignal !== undefined) {
    throw pendingLaunchStoppedError(stoppedSignal)
  }
}

export function waitForLaunchStop<T>(
  promise: Promise<T>,
  signals: LaunchStopSignals,
): Promise<T> {
  throwIfLaunchStopRequested(signals)
  const activeSignals = signals.filter(
    (signal): signal is AbortSignal => signal !== undefined,
  )
  if (activeSignals.length === 0) {
    return promise
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const stopListeners = new Map<AbortSignal, () => void>()
    const cleanup = () => {
      for (const [signal, listener] of stopListeners) {
        signal.removeEventListener("abort", listener)
      }
      stopListeners.clear()
    }
    const stop = (signal: AbortSignal) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(pendingLaunchStoppedError(signal))
    }

    for (const signal of activeSignals) {
      if (settled) {
        break
      }
      const listener = () => {
        stop(signal)
      }
      stopListeners.set(signal, listener)
      signal.addEventListener("abort", listener, { once: true })
      if (signal.aborted) {
        stop(signal)
      }
    }
    promise.then(
      (value) => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        resolve(value)
      },
      (error) => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        reject(error)
      },
    )
  })
}
