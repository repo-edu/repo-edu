import type {
  ExaminationSession,
  ExaminationSourceSummary,
  ExaminationState,
} from "./examination-store-types.js"

export function selectActiveExaminationSession(
  state: ExaminationState,
): ExaminationSession | null {
  return state.activeSourceSessionKey === null
    ? null
    : (state.sourceSessions.get(state.activeSourceSessionKey) ?? null)
}

export function selectExaminationSession(
  sourceSessionKey: string | null,
): (state: ExaminationState) => ExaminationSession | null {
  return (state) =>
    sourceSessionKey === null
      ? null
      : (state.sourceSessions.get(sourceSessionKey) ?? null)
}

export function selectExaminationSourceSummary(
  sourceSummaryKey: string | null,
): (state: ExaminationState) => ExaminationSourceSummary | null {
  return (state) =>
    sourceSummaryKey === null
      ? null
      : (state.sourceSummaries.get(sourceSummaryKey) ?? null)
}
