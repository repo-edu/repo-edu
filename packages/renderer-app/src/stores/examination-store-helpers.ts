import type { SourceIdentity } from "../components/tabs/examination/source.js"
import {
  mergeSupersedingAvailableArchiveEntries,
  supersededAvailableArchiveEntryKeys,
} from "./examination-archive-entries.js"
import { examinationRequestSidecar } from "./examination-request-sidecar.js"
import type {
  ExaminationEntry,
  ExaminationLivePreferences,
  ExaminationSession,
  ExaminationSourceSummary,
  ExaminationState,
  LoadedArchiveResultPayload,
} from "./examination-store-types.js"

export function resolveSelectedSubjectId(params: {
  current: string | null
  fallback: string
  subjectIds: readonly string[]
}): string {
  if (params.current !== null && params.subjectIds.includes(params.current)) {
    return params.current
  }
  if (params.subjectIds.includes(params.fallback)) return params.fallback
  return params.subjectIds[0] ?? params.fallback
}

export function withPreferences(
  identity: SourceIdentity,
  preferences: ExaminationLivePreferences,
): SourceIdentity {
  return {
    ...identity,
    questionCount: preferences.questionCount,
    model: preferences.modelCode ?? identity.model,
    effort: preferences.effort ?? identity.effort,
  }
}

export function nextLookupDisplay(
  session: ExaminationSession,
  entryKey: string,
  exactEntry: ExaminationEntry | null,
): ExaminationSession {
  if (exactEntry === null) {
    if (
      session.display.kind === "archived" &&
      session.display.source === "lookup"
    ) {
      return { ...session, display: { kind: "idle" } }
    }
    return session
  }
  if (session.display.kind === "loading") return session
  if (
    session.display.kind === "archived" &&
    (session.display.source === "pinned" ||
      session.display.source === "just-generated")
  ) {
    return session
  }
  return {
    ...session,
    display: { kind: "archived", entryKey, source: "lookup" },
  }
}

export function completedEntry(entry: ExaminationEntry): ExaminationEntry {
  return {
    ...entry,
    generationControlId: null,
    stopRequested: false,
  }
}

export function completeGenerationSession(
  session: ExaminationSession,
  payload: LoadedArchiveResultPayload,
): ExaminationSession {
  return {
    ...session,
    display: {
      kind: "archived",
      entryKey: payload.resultKey,
      source: "just-generated",
    },
    pinnedEntryKey: payload.resultKey,
    archiveEntries:
      payload.archiveEntry === undefined
        ? session.archiveEntries
        : mergeSupersedingAvailableArchiveEntries(session.archiveEntries, [
            payload.archiveEntry,
          ]),
    pendingGenerationRequestId: null,
    pendingGenerationEntryKey: null,
  }
}

export function updateSummaryForGeneration(
  summary: ExaminationSourceSummary,
  session: ExaminationSession,
  entry: ExaminationEntry,
): ExaminationSourceSummary {
  const counts = new Map(summary.generatedQuestionCountBySubjectId)
  counts.set(
    session.sourceIdentity.subjectId,
    Math.max(
      counts.get(session.sourceIdentity.subjectId) ?? 0,
      entry.archivedQuestionCount ?? 0,
    ),
  )
  return {
    ...summary,
    generatedQuestionCountBySubjectId: counts,
  }
}

export function applyGenerationCompletionToCurrentState(
  state: ExaminationState,
  payload: LoadedArchiveResultPayload,
): Partial<ExaminationState> | ExaminationState {
  const entriesByKey = new Map(state.entriesByKey)
  const sourceSessions = new Map(state.sourceSessions)
  const sourceSummaries = new Map(state.sourceSummaries)
  if (payload.loadingKey !== null && payload.loadingKey !== payload.resultKey) {
    entriesByKey.delete(payload.loadingKey)
  }
  entriesByKey.set(payload.resultKey, completedEntry(payload.entry))

  if (
    payload.sourceSessionKey !== undefined &&
    payload.requestId !== undefined
  ) {
    const session = state.sourceSessions.get(payload.sourceSessionKey)
    if (
      session === undefined ||
      session.pendingGenerationRequestId !== payload.requestId
    ) {
      return state
    }
    const supersededKeys =
      payload.archiveEntry === undefined
        ? new Set<string>()
        : supersededAvailableArchiveEntryKeys(session.archiveEntries, [
            payload.archiveEntry,
          ])
    for (const key of supersededKeys) {
      if (key !== payload.loadingKey && key !== payload.resultKey) {
        entriesByKey.delete(key)
      }
    }
    sourceSessions.set(
      payload.sourceSessionKey,
      completeGenerationSession(session, payload),
    )
    const summary = sourceSummaries.get(payload.sourceSummaryKey ?? "")
    if (summary !== undefined) {
      sourceSummaries.set(
        summary.sourceSummaryKey,
        updateSummaryForGeneration(summary, session, payload.entry),
      )
    }
  }
  return { entriesByKey, sourceSessions, sourceSummaries }
}

export function removeMatchingSourceState(
  state: ExaminationState,
  matchesSession: (key: string, session: ExaminationSession) => boolean,
  matchesSummary: (key: string, summary: ExaminationSourceSummary) => boolean,
): Pick<
  ExaminationState,
  | "sourceSessions"
  | "sourceSummaries"
  | "activeSourceSessionKey"
  | "activeSourceSummaryKey"
> {
  const sourceSessions = new Map(state.sourceSessions)
  for (const [key, session] of sourceSessions) {
    if (matchesSession(key, session)) {
      const lookupRequestId = session.pendingLookupRequestId
      if (lookupRequestId !== null) {
        examinationRequestSidecar.abortLookup(key, lookupRequestId)
      }
      const requestId = session.pendingGenerationRequestId
      if (requestId !== null) {
        examinationRequestSidecar.abortGeneration(key, requestId)
      }
      sourceSessions.delete(key)
    }
  }

  const sourceSummaries = new Map(state.sourceSummaries)
  for (const [key, summary] of sourceSummaries) {
    if (matchesSummary(key, summary)) {
      const requestId = summary.pendingRequestId
      if (requestId !== null) {
        examinationRequestSidecar.abortSummary(key, requestId)
      }
      sourceSummaries.delete(key)
    }
  }

  return {
    sourceSessions,
    sourceSummaries,
    activeSourceSessionKey:
      state.activeSourceSessionKey !== null &&
      !sourceSessions.has(state.activeSourceSessionKey)
        ? null
        : state.activeSourceSessionKey,
    activeSourceSummaryKey:
      state.activeSourceSummaryKey !== null &&
      !sourceSummaries.has(state.activeSourceSummaryKey)
        ? null
        : state.activeSourceSummaryKey,
  }
}

export function acceptGenerationEvent(
  state: ExaminationState,
  sourceSessionKey: string,
  requestId: string,
): boolean {
  const session = state.sourceSessions.get(sourceSessionKey)
  return session?.pendingGenerationRequestId === requestId
}

export function clampQuestionCount(count: number): number {
  if (!Number.isFinite(count)) return 4
  const integer = Math.round(count)
  if (integer < 1) return 1
  if (integer > 20) return 20
  return integer
}

export function createRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  )
}
