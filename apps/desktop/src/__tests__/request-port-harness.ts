import { MessageChannel } from "node:worker_threads"
import type { RequestPort } from "../request-port-endpoint"

export function requestChannel() {
  const channel = new MessageChannel()
  const listenerCounts = [0, 0]
  const ports = [channel.port1, channel.port2].map(
    (port, index): RequestPort => ({
      postMessage: (message) => port.postMessage(message),
      close: () => port.close(),
      start: () => port.start(),
      listen(message, closed, malformed) {
        const receive = (data: unknown) => message(data, [])
        port.on("message", receive)
        port.on("close", closed)
        port.on("messageerror", malformed)
        listenerCounts[index] += 3
        return () => {
          port.off("message", receive)
          port.off("close", closed)
          port.off("messageerror", malformed)
          listenerCounts[index] -= 3
        }
      },
    }),
  )
  return {
    host: ports[0],
    renderer: ports[1],
    listenerCounts,
    dispose() {
      channel.port1.close()
      channel.port2.close()
    },
  }
}

/** Resolves with the probe's first truthy value, so callers keep the narrowed type. */
export async function until<T>(probe: () => T): Promise<NonNullable<T>> {
  for (let turn = 0; turn < 100; turn++) {
    const value = probe()
    if (value) return value
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
  throw new Error("Request-port event did not arrive.")
}
