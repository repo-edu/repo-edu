import type {
  Disposable,
  Message,
  MessageStrategy,
  RequestMessage,
} from "vscode-jsonrpc/node"

export type CodexAppServerRequestId = string | number

function isRequestMessage(message: Message): message is RequestMessage {
  const candidate = message as Partial<RequestMessage>
  return (
    typeof candidate.method === "string" &&
    (typeof candidate.id === "string" ||
      typeof candidate.id === "number" ||
      candidate.id === null)
  )
}

export class CodexAppServerRequestCorrelator {
  private readonly pending = new Map<
    string,
    (CodexAppServerRequestId | null)[]
  >()

  readonly messageStrategy: MessageStrategy = {
    handleMessage: (message, next) => {
      if (isRequestMessage(message)) {
        const requests = this.pending.get(message.method) ?? []
        requests.push(message.id)
        this.pending.set(message.method, requests)
      }
      return next(message)
    },
  }

  take(method: string): CodexAppServerRequestId {
    const requests = this.pending.get(method)
    const id = requests?.shift()
    if (requests?.length === 0) this.pending.delete(method)
    if (id === undefined || id === null) {
      throw new Error(
        `The Codex app-server request ${method} has no correlatable request ID.`,
      )
    }
    return id
  }
}

type PendingWriteListener = {
  active: boolean
  readonly listener: () => void
}

export class CodexAppServerRequestWriteTracker {
  private readonly listeners = new Map<string, PendingWriteListener[]>()

  onNext(method: string, listener: () => void): Disposable {
    const pending = { active: true, listener }
    const listeners = this.listeners.get(method) ?? []
    listeners.push(pending)
    this.listeners.set(method, listeners)
    return {
      dispose() {
        pending.active = false
      },
    }
  }

  written(message: Message): void {
    if (!isRequestMessage(message)) return
    const listeners = this.listeners.get(message.method)
    if (listeners === undefined) return
    let pending = listeners.shift()
    while (pending !== undefined && !pending.active) {
      pending = listeners.shift()
    }
    if (listeners.length === 0) this.listeners.delete(message.method)
    if (pending?.active === true) {
      pending.active = false
      pending.listener()
    }
  }
}
