import { createServer, type Server } from "node:http"

import open from "open"

export type BrowserLauncher = (url: string) => Promise<unknown>

export type ServeAreaOverviewOptions = {
  readonly host?: string
  readonly timeoutMs?: number
  readonly launch?: BrowserLauncher
}

export type ServedAreaOverview = {
  readonly url: string
}

const DEFAULT_HOST = "127.0.0.1"
const DEFAULT_TIMEOUT_MS = 60_000

export async function serveAreaOverviewOnce(
  html: string,
  options: ServeAreaOverviewOptions = {},
): Promise<ServedAreaOverview> {
  const host = options.host ?? DEFAULT_HOST
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const launch = options.launch ?? ((url: string) => open(url, { wait: false }))
  let served = false
  let closePromise: Promise<void> | undefined

  const server = createServer((request, response) => {
    request.resume()
    if (served) {
      response.writeHead(410, { "content-type": "text/plain; charset=utf-8" })
      response.end("Area overview was already served.")
      return
    }

    served = true
    response.writeHead(200, {
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'",
      "content-type": "text/html; charset=utf-8",
    })
    response.end(html, () => {
      firstResponse.resolve()
      void closeServer(server)
    })
  })

  const firstResponse = deferred<void>()
  await listen(server, host)

  const address = server.address()
  if (typeof address !== "object" || address === null) {
    await closeServer(server)
    throw new Error("Unable to read overview server address.")
  }

  const url = `http://${host}:${address.port}/`
  const timeout = setTimeout(() => {
    firstResponse.resolve()
    void closeServer(server)
  }, timeoutMs)

  async function closeServer(serverToClose: Server): Promise<void> {
    closePromise ??= new Promise<void>((resolve, reject) => {
      serverToClose.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await closePromise
  }

  try {
    await launch(url)
    await firstResponse.promise
    return { url }
  } finally {
    clearTimeout(timeout)
    await closeServer(server)
  }
}

function listen(server: Server, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, host, () => {
      server.off("error", reject)
      resolve()
    })
  })
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
} {
  let resolveValue: (value: T | PromiseLike<T>) => void = () => {}
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve
  })
  return {
    promise,
    resolve: resolveValue,
  }
}
