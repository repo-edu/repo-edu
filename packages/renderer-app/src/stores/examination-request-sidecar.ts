type RequestSidecarEntry = {
  controller: AbortController
  generationControlId?: string
}

function sidecarKey(ownerKey: string, requestId: string): string {
  return `${ownerKey}\n${requestId}`
}

const lookupRequestSidecar = new Map<string, RequestSidecarEntry>()
const summaryRequestSidecar = new Map<string, RequestSidecarEntry>()
const generationRequestSidecar = new Map<string, RequestSidecarEntry>()

export const examinationRequestSidecar = {
  registerLookup(
    sourceSessionKey: string,
    requestId: string,
    controller: AbortController,
  ): void {
    replaceSidecarEntry(lookupRequestSidecar, sourceSessionKey, requestId, {
      controller,
    })
  },
  clearLookup(sourceSessionKey: string, requestId: string): void {
    lookupRequestSidecar.delete(sidecarKey(sourceSessionKey, requestId))
  },
  abortLookup(sourceSessionKey: string, requestId: string): void {
    abortSidecarEntry(lookupRequestSidecar, sourceSessionKey, requestId)
  },
  registerSummary(
    sourceSummaryKey: string,
    requestId: string,
    controller: AbortController,
  ): void {
    replaceSidecarEntry(summaryRequestSidecar, sourceSummaryKey, requestId, {
      controller,
    })
  },
  clearSummary(sourceSummaryKey: string, requestId: string): void {
    summaryRequestSidecar.delete(sidecarKey(sourceSummaryKey, requestId))
  },
  abortSummary(sourceSummaryKey: string, requestId: string): void {
    abortSidecarEntry(summaryRequestSidecar, sourceSummaryKey, requestId)
  },
  registerGeneration(
    sourceSessionKey: string,
    requestId: string,
    controller: AbortController,
    generationControlId: string,
  ): void {
    replaceSidecarEntry(generationRequestSidecar, sourceSessionKey, requestId, {
      controller,
      generationControlId,
    })
  },
  clearGeneration(sourceSessionKey: string, requestId: string): void {
    generationRequestSidecar.delete(sidecarKey(sourceSessionKey, requestId))
  },
  abortGeneration(sourceSessionKey: string, requestId: string): string | null {
    const key = sidecarKey(sourceSessionKey, requestId)
    const entry = generationRequestSidecar.get(key)
    if (entry === undefined) return null
    entry.controller.abort()
    generationRequestSidecar.delete(key)
    return entry.generationControlId ?? null
  },
  clearAll(): void {
    abortAndClearSidecar(lookupRequestSidecar)
    abortAndClearSidecar(summaryRequestSidecar)
    abortAndClearSidecar(generationRequestSidecar)
  },
}

function replaceSidecarEntry(
  sidecar: Map<string, RequestSidecarEntry>,
  ownerKey: string,
  requestId: string,
  entry: RequestSidecarEntry,
): void {
  for (const [key, current] of sidecar) {
    if (key.startsWith(`${ownerKey}\n`)) {
      current.controller.abort()
      sidecar.delete(key)
    }
  }
  sidecar.set(sidecarKey(ownerKey, requestId), entry)
}

function abortSidecarEntry(
  sidecar: Map<string, RequestSidecarEntry>,
  ownerKey: string,
  requestId: string,
): void {
  const key = sidecarKey(ownerKey, requestId)
  sidecar.get(key)?.controller.abort()
  sidecar.delete(key)
}

function abortAndClearSidecar(sidecar: Map<string, RequestSidecarEntry>): void {
  for (const entry of sidecar.values()) {
    entry.controller.abort()
  }
  sidecar.clear()
}
