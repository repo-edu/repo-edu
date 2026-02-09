import type {
  GroupSet,
  GroupSetConnection,
} from "@repo-edu/backend-interface/types"

/**
 * Backend Rust DTOs may serialize oneOf schemas as `{ value: {...} }`.
 * Some payloads also arrive as `{ entries: {...} }`.
 * Normalize these shapes to the expected tagged union.
 */
export function unwrapGroupSetConnection(
  connection: GroupSet["connection"],
): GroupSetConnection | null {
  if (!connection) return null
  if (typeof connection === "object" && "kind" in connection) {
    return connection as GroupSetConnection
  }

  const entries = (connection as { entries?: unknown }).entries
  if (entries && typeof entries === "object" && "kind" in entries) {
    return entries as GroupSetConnection
  }

  const raw = (connection as { value?: unknown }).value
  if (raw && typeof raw === "object" && "kind" in raw) {
    return raw as GroupSetConnection
  }
  if (raw && typeof raw === "object") {
    const rawEntries = (raw as { entries?: unknown }).entries
    if (rawEntries && typeof rawEntries === "object" && "kind" in rawEntries) {
      return rawEntries as GroupSetConnection
    }
  }
  return null
}
