import type {
  AnalysisProgress,
  DiscoverReposProgress,
} from "@repo-edu/application-contract"
import { create } from "zustand"

type AnalysisRequestProgress = {
  readonly requestId: string
  readonly progress: AnalysisProgress | null
}

type BlameRequestProgress = {
  readonly requestId: string
  readonly progress: AnalysisProgress | null
  readonly partialAuthorLines: ReadonlyMap<string, number>
}

export type AnalysisTransientState = {
  discoveryRequestId: string | null
  discoveryProgress: DiscoverReposProgress | null
  analysisByRequestKey: Map<string, AnalysisRequestProgress>
  blameByRequestKey: Map<string, BlameRequestProgress>
}

export type AnalysisTransientActions = {
  startDiscovery: (requestId: string) => void
  setDiscoveryProgress: (
    requestId: string,
    progress: DiscoverReposProgress | null,
  ) => void
  finishDiscovery: (requestId: string) => void
  startAnalysis: (requestKey: string, requestId: string) => void
  setAnalysisProgress: (
    requestKey: string,
    requestId: string,
    progress: AnalysisProgress | null,
  ) => void
  finishAnalysis: (requestKey: string, requestId: string) => void
  startBlame: (requestKey: string, requestId: string) => void
  setBlameProgress: (
    requestKey: string,
    requestId: string,
    progress: AnalysisProgress | null,
  ) => void
  setBlamePartialAuthorLines: (
    requestKey: string,
    requestId: string,
    lines: ReadonlyMap<string, number>,
  ) => void
  finishBlame: (requestKey: string, requestId: string) => void
}

export const EMPTY_PARTIAL_AUTHOR_LINES: ReadonlyMap<string, number> = new Map()

function nextMap<K, V>(map: Map<K, V>): Map<K, V> {
  return new Map(map)
}

function updateMatching<K, V extends { readonly requestId: string }>(
  map: Map<K, V>,
  key: K,
  requestId: string,
  update: (entry: V) => V,
): Map<K, V> {
  const entry = map.get(key)
  if (entry?.requestId !== requestId) return map
  const next = nextMap(map)
  next.set(key, update(entry))
  return next
}

export const useAnalysisTransientStore = create<
  AnalysisTransientState & AnalysisTransientActions
>((set) => ({
  discoveryRequestId: null,
  discoveryProgress: null,
  analysisByRequestKey: new Map(),
  blameByRequestKey: new Map(),

  startDiscovery: (discoveryRequestId) =>
    set({ discoveryRequestId, discoveryProgress: null }),
  setDiscoveryProgress: (requestId, discoveryProgress) =>
    set((state) =>
      state.discoveryRequestId === requestId ? { discoveryProgress } : state,
    ),
  finishDiscovery: (requestId) =>
    set((state) =>
      state.discoveryRequestId === requestId
        ? { discoveryRequestId: null, discoveryProgress: null }
        : state,
    ),

  startAnalysis: (requestKey, requestId) =>
    set((state) => {
      const analysisByRequestKey = nextMap(state.analysisByRequestKey)
      analysisByRequestKey.set(requestKey, { requestId, progress: null })
      return { analysisByRequestKey }
    }),
  setAnalysisProgress: (requestKey, requestId, progress) =>
    set((state) => ({
      analysisByRequestKey: updateMatching(
        state.analysisByRequestKey,
        requestKey,
        requestId,
        (entry) => ({ ...entry, progress }),
      ),
    })),
  finishAnalysis: (requestKey, requestId) =>
    set((state) => {
      const entry = state.analysisByRequestKey.get(requestKey)
      if (entry?.requestId !== requestId) return state
      const analysisByRequestKey = nextMap(state.analysisByRequestKey)
      analysisByRequestKey.delete(requestKey)
      return { analysisByRequestKey }
    }),

  startBlame: (requestKey, requestId) =>
    set((state) => {
      const blameByRequestKey = nextMap(state.blameByRequestKey)
      blameByRequestKey.set(requestKey, {
        requestId,
        progress: null,
        partialAuthorLines: EMPTY_PARTIAL_AUTHOR_LINES,
      })
      return { blameByRequestKey }
    }),
  setBlameProgress: (requestKey, requestId, progress) =>
    set((state) => ({
      blameByRequestKey: updateMatching(
        state.blameByRequestKey,
        requestKey,
        requestId,
        (entry) => ({ ...entry, progress }),
      ),
    })),
  setBlamePartialAuthorLines: (requestKey, requestId, partialAuthorLines) =>
    set((state) => ({
      blameByRequestKey: updateMatching(
        state.blameByRequestKey,
        requestKey,
        requestId,
        (entry) => ({ ...entry, partialAuthorLines }),
      ),
    })),
  finishBlame: (requestKey, requestId) =>
    set((state) => {
      const entry = state.blameByRequestKey.get(requestKey)
      if (entry?.requestId !== requestId) return state
      const blameByRequestKey = nextMap(state.blameByRequestKey)
      blameByRequestKey.delete(requestKey)
      return { blameByRequestKey }
    }),
}))
