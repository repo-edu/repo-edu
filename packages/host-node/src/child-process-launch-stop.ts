export type LaunchStopSignals = readonly (AbortSignal | undefined)[]

export function launchStopRequested(signals: LaunchStopSignals): boolean {
  return signals.some((signal) => signal?.aborted === true)
}

export function pendingLaunchStoppedError(): Error {
  return new Error("The pending child-process launch was stopped.")
}

export function throwIfLaunchStopRequested(signals: LaunchStopSignals): void {
  if (launchStopRequested(signals)) {
    throw pendingLaunchStoppedError()
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
    const cleanup = () => {
      for (const signal of activeSignals) {
        signal.removeEventListener("abort", onStop)
      }
    }
    const onStop = () => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(pendingLaunchStoppedError())
    }

    for (const signal of activeSignals) {
      if (settled) {
        break
      }
      signal.addEventListener("abort", onStop, { once: true })
      if (signal.aborted) {
        onStop()
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
