import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { createContext, useContext } from "react"

let currentHost: RendererHost | null = null

export function setRendererHost(host: RendererHost): void {
  currentHost = host
}

export function clearRendererHost(): void {
  currentHost = null
}

export function getRendererHost(): RendererHost {
  if (!currentHost) {
    throw new Error(
      "RendererHost not initialized. Call setRendererHost() before using hooks.",
    )
  }
  return currentHost
}

const RendererHostContext = createContext<RendererHost | null>(null)

export const RendererHostProvider = RendererHostContext.Provider

export function useRendererHost(): RendererHost {
  const host = useContext(RendererHostContext)
  if (!host) {
    throw new Error(
      "useRendererHost must be used within a RendererHostProvider.",
    )
  }
  return host
}
