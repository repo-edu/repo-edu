export type RendererCloseChannels = {
  request: string
  cancel: string
  complete: string
  cancelComplete: string
}

export type RendererCloseTarget = {
  isUnavailable(): boolean
  setEnabled(enabled: boolean): void
  send(channel: string, payload: { requestId: string }): void
}

export type RendererCloseTransport = {
  subscribe(channel: string, listener: (response: unknown) => void): () => void
}

type CloseScheduler = (
  callback: () => void,
  timeoutMs: number,
) => { cancel(): void }

const defaultScheduler: CloseScheduler = (callback, timeoutMs) => {
  const timer = setTimeout(callback, timeoutMs)
  return { cancel: () => clearTimeout(timer) }
}

export async function runRendererCloseGate(options: {
  requestId: string
  target: RendererCloseTarget
  transport: RendererCloseTransport
  channels: RendererCloseChannels
  timeoutMs?: number
  scheduler?: CloseScheduler
  log?: (message: string) => void
}): Promise<boolean> {
  const { target } = options
  if (target.isUnavailable()) return true
  target.setEnabled(false)
  try {
    const closed = await requestRendererClose(options)
    if (!closed && !target.isUnavailable()) target.setEnabled(true)
    return closed
  } catch (error) {
    if (!target.isUnavailable()) target.setEnabled(true)
    throw error
  }
}

function requestRendererClose({
  requestId,
  target,
  transport,
  channels,
  timeoutMs = 5_000,
  scheduler = defaultScheduler,
  log = () => undefined,
}: {
  requestId: string
  target: RendererCloseTarget
  transport: RendererCloseTransport
  channels: RendererCloseChannels
  timeoutMs?: number
  scheduler?: CloseScheduler
  log?: (message: string) => void
}): Promise<boolean> {
  return new Promise((resolve) => {
    let phase: "waiting" | "cancelling" | "settled" = "waiting"
    let timeout: { cancel(): void } | null = null
    let unsubscribeComplete: () => void = () => {}
    let unsubscribeCancellation: () => void = () => {}

    const finish = (closed: boolean) => {
      if (phase === "settled") return
      phase = "settled"
      unsubscribeComplete()
      unsubscribeCancellation()
      timeout?.cancel()
      resolve(closed)
    }

    unsubscribeComplete = transport.subscribe(channels.complete, (response) => {
      if (phase !== "waiting" || !isMatchingResponse(response, requestId))
        return
      const result = response as { ok?: unknown; message?: unknown }
      if (result.ok !== true && typeof result.message === "string") {
        log(`renderer-close-failed ${result.message}`)
      }
      finish(result.ok === true)
    })
    unsubscribeCancellation = transport.subscribe(
      channels.cancelComplete,
      (response) => {
        if (phase !== "cancelling" || !isMatchingResponse(response, requestId))
          return
        finish(false)
      },
    )

    timeout = scheduler(() => {
      if (phase !== "waiting") return
      phase = "cancelling"
      timeout = null
      log("renderer-close-timeout")
      try {
        target.send(channels.cancel, { requestId })
      } catch {
        finish(true)
      }
    }, timeoutMs)

    try {
      target.send(channels.request, { requestId })
    } catch {
      finish(true)
    }
  })
}

function isMatchingResponse(response: unknown, requestId: string): boolean {
  return (
    typeof response === "object" &&
    response !== null &&
    (response as { requestId?: unknown }).requestId === requestId
  )
}
