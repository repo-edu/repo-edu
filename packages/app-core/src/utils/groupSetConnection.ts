import type {
  GroupSet,
  GroupSetConnection,
} from "@repo-edu/backend-interface/types"

/**
 * Backend Rust DTOs may serialize oneOf schemas as `{ value: {...} }`.
 * Normalize both wire shapes to the expected tagged union.
 */
export function unwrapGroupSetConnection(
  connection: GroupSet["connection"],
): GroupSetConnection | null {
  if (!connection) return null
  if ("kind" in connection) return connection
  const raw = (connection as { value?: unknown }).value
  if (raw && typeof raw === "object" && "kind" in raw) {
    return raw as GroupSetConnection
  }
  return null
}
