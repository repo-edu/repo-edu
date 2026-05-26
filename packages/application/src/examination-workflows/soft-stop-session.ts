export type SoftStopSession = {
  readonly requested: boolean
  providerSignal(hardSignal: AbortSignal | undefined): AbortSignal
  requestStop(): void
  dispose(): void
}

export function createSoftStopSession(
  sessions: Map<string, SoftStopSession>,
  generationControlId: string,
): SoftStopSession {
  sessions.get(generationControlId)?.requestStop()

  const providerController = new AbortController()
  let requested = false
  let hardSignal: AbortSignal | undefined
  const abortProvider = () => providerController.abort()
  const session: SoftStopSession = {
    get requested() {
      return requested
    },
    providerSignal(signal) {
      hardSignal = signal
      if (signal?.aborted) {
        providerController.abort()
      } else {
        signal?.addEventListener("abort", abortProvider, { once: true })
      }
      return providerController.signal
    },
    requestStop() {
      requested = true
      providerController.abort()
    },
    dispose() {
      hardSignal?.removeEventListener("abort", abortProvider)
      if (sessions.get(generationControlId) === session) {
        sessions.delete(generationControlId)
      }
    },
  }
  sessions.set(generationControlId, session)
  return session
}
