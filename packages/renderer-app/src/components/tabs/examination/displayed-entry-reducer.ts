import type { SourceIdentity } from "./source.js"

export type DisplayedEntryState =
  | { kind: "idle" }
  | { kind: "loading"; entryKey: string }
  | {
      kind: "archived"
      entryKey: string
      source: "pinned" | "lookup" | "just-generated"
    }
  | { kind: "error"; entryKey: string }

export type DisplayedEntryReducerState = {
  identity: SourceIdentity | null
  display: DisplayedEntryState
  pinnedEntryKey: string | null
}

export type DisplayedEntryEvent =
  | { type: "SOURCE_RESET"; identity: SourceIdentity | null }
  | { type: "IDENTITY_CHANGED"; identity: SourceIdentity | null }
  | {
      type: "EXCERPT_SCOPE_RESOLVED"
      provisionalIdentity: SourceIdentity
      resolvedExcerptScopeId: string
    }
  | {
      type: "LOOKUP_SUCCESS"
      identity: SourceIdentity
      exactEntryKey: string | null
    }
  | { type: "LOOKUP_MISS"; identity: SourceIdentity }
  | { type: "ARCHIVE_SELECTED"; identity: SourceIdentity; entryKey: string }
  | { type: "GENERATION_STARTED"; identity: SourceIdentity; entryKey: string }
  | { type: "GENERATION_SUCCEEDED"; identity: SourceIdentity; entryKey: string }
  | { type: "GENERATION_FAILED"; identity: SourceIdentity; entryKey: string }
  | { type: "QUESTION_COUNT_CHANGED"; identity: SourceIdentity | null }
  | { type: "MODEL_CHANGED"; identity: SourceIdentity | null }

export const initialDisplayedEntryReducerState: DisplayedEntryReducerState = {
  identity: null,
  display: { kind: "idle" },
  pinnedEntryKey: null,
}

export function displayedEntryReducer(
  state: DisplayedEntryReducerState,
  event: DisplayedEntryEvent,
): DisplayedEntryReducerState {
  switch (event.type) {
    case "SOURCE_RESET":
      return resetToIdentity(event.identity)
    case "IDENTITY_CHANGED":
    case "QUESTION_COUNT_CHANGED":
    case "MODEL_CHANGED":
      return transitionIdentity(state, event.identity)
    case "EXCERPT_SCOPE_RESOLVED":
      return promoteExcerptScope(state, event)
    case "LOOKUP_SUCCESS":
      if (!sameIdentity(state.identity, event.identity)) return state
      if (event.exactEntryKey === null) return state
      if (state.display.kind === "loading") return state
      if (
        state.display.kind === "archived" &&
        (state.display.source === "pinned" ||
          state.display.source === "just-generated")
      ) {
        return state
      }
      return {
        ...state,
        display: {
          kind: "archived",
          entryKey: event.exactEntryKey,
          source: "lookup",
        },
      }
    case "LOOKUP_MISS":
      if (!sameIdentity(state.identity, event.identity)) return state
      if (
        state.display.kind === "archived" &&
        state.display.source === "lookup"
      ) {
        return { ...state, display: { kind: "idle" } }
      }
      return state
    case "ARCHIVE_SELECTED":
      return {
        identity: event.identity,
        display: {
          kind: "archived",
          entryKey: event.entryKey,
          source: "pinned",
        },
        pinnedEntryKey: event.entryKey,
      }
    case "GENERATION_STARTED":
      return {
        ...state,
        identity: event.identity,
        display: { kind: "loading", entryKey: event.entryKey },
      }
    case "GENERATION_SUCCEEDED":
      if (!sameIdentity(state.identity, event.identity)) return state
      return {
        ...state,
        display: {
          kind: "archived",
          entryKey: event.entryKey,
          source: "just-generated",
        },
        pinnedEntryKey: event.entryKey,
      }
    case "GENERATION_FAILED":
      if (!sameIdentity(state.identity, event.identity)) return state
      return {
        ...state,
        display: { kind: "error", entryKey: event.entryKey },
      }
  }
}

function resetToIdentity(
  identity: SourceIdentity | null,
): DisplayedEntryReducerState {
  return {
    identity,
    display: { kind: "idle" },
    pinnedEntryKey: null,
  }
}

function transitionIdentity(
  state: DisplayedEntryReducerState,
  identity: SourceIdentity | null,
): DisplayedEntryReducerState {
  if (sameIdentity(state.identity, identity)) return state
  return resetToIdentity(identity)
}

function promoteExcerptScope(
  state: DisplayedEntryReducerState,
  event: Extract<DisplayedEntryEvent, { type: "EXCERPT_SCOPE_RESOLVED" }>,
): DisplayedEntryReducerState {
  if (!sameIdentity(state.identity, event.provisionalIdentity)) return state
  if (event.provisionalIdentity.kind !== "course") return state
  return {
    ...state,
    identity: {
      ...event.provisionalIdentity,
      excerptScopeId: event.resolvedExcerptScopeId,
    },
  }
}

function sameIdentity(
  left: SourceIdentity | null,
  right: SourceIdentity | null,
): boolean {
  return sourceIdentityKey(left) === sourceIdentityKey(right)
}

export function sourceIdentityKey(identity: SourceIdentity | null): string {
  if (identity === null) return "null"
  if (identity.kind === "course") {
    return JSON.stringify([
      identity.kind,
      identity.repoPath,
      identity.commitOid,
      identity.subjectId,
      identity.excerptScopeId,
      identity.redactionIdentityScopeId,
      identity.questionCount,
      identity.model,
      identity.effort,
    ])
  }
  return JSON.stringify([
    identity.kind,
    identity.folderPath,
    identity.contentScopeId,
    identity.subjectId,
    identity.redactionIdentityScopeId,
    identity.questionCount,
    identity.model,
    identity.effort,
  ])
}
