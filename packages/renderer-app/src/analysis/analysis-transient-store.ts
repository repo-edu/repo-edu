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
  analysisByRepoPath: Map<string, AnalysisRequestProgress>
  blameByRepoPath: Map<string, BlameRequestProgress>
}

export type AnalysisTransientActions = {
  startDiscovery: (requestId: string) => void
  setDiscoveryProgress: (
    requestId: string,
    progress: DiscoverReposProgress | null,
  ) => void
  finishDiscovery: (requestId: string) => void
  startAnalysis: (repoPath: string, requestId: string) => void
  setAnalysisProgress: (
    repoPath: string,
    requestId: string,
    progress: AnalysisProgress | null,
  ) => void
  finishAnalysis: (repoPath: string, requestId: string) => void
  startBlame: (repoPath: string, requestId: string) => void
  setBlameProgress: (
    repoPath: string,
    requestId: string,
    progress: AnalysisProgress | null,
  ) => void
  setBlamePartialAuthorLines: (
    repoPath: string,
    requestId: string,
    lines: ReadonlyMap<string, number>,
  ) => void
  finishBlame: (repoPath: string, requestId: string) => void
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
  analysisByRepoPath: new Map(),
  blameByRepoPath: new Map(),

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

  startAnalysis: (repoPath, requestId) =>
    set((state) => {
      const analysisByRepoPath = nextMap(state.analysisByRepoPath)
      analysisByRepoPath.set(repoPath, { requestId, progress: null })
      return { analysisByRepoPath }
    }),
  setAnalysisProgress: (repoPath, requestId, progress) =>
    set((state) => ({
      analysisByRepoPath: updateMatching(
        state.analysisByRepoPath,
        repoPath,
        requestId,
        (entry) => ({ ...entry, progress }),
      ),
    })),
  finishAnalysis: (repoPath, requestId) =>
    set((state) => {
      const entry = state.analysisByRepoPath.get(repoPath)
      if (entry?.requestId !== requestId) return state
      const analysisByRepoPath = nextMap(state.analysisByRepoPath)
      analysisByRepoPath.delete(repoPath)
      return { analysisByRepoPath }
    }),

  startBlame: (repoPath, requestId) =>
    set((state) => {
      const blameByRepoPath = nextMap(state.blameByRepoPath)
      blameByRepoPath.set(repoPath, {
        requestId,
        progress: null,
        partialAuthorLines: EMPTY_PARTIAL_AUTHOR_LINES,
      })
      return { blameByRepoPath }
    }),
  setBlameProgress: (repoPath, requestId, progress) =>
    set((state) => ({
      blameByRepoPath: updateMatching(
        state.blameByRepoPath,
        repoPath,
        requestId,
        (entry) => ({ ...entry, progress }),
      ),
    })),
  setBlamePartialAuthorLines: (repoPath, requestId, partialAuthorLines) =>
    set((state) => ({
      blameByRepoPath: updateMatching(
        state.blameByRepoPath,
        repoPath,
        requestId,
        (entry) => ({ ...entry, partialAuthorLines }),
      ),
    })),
  finishBlame: (repoPath, requestId) =>
    set((state) => {
      const entry = state.blameByRepoPath.get(repoPath)
      if (entry?.requestId !== requestId) return state
      const blameByRepoPath = nextMap(state.blameByRepoPath)
      blameByRepoPath.delete(repoPath)
      return { blameByRepoPath }
    }),
}))
