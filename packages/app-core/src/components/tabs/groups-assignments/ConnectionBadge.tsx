import type { GroupSetConnection } from "@repo-edu/backend-interface/types"

/** Lowercase label for a group set connection type. */
export function connectionLabel(connection: GroupSetConnection | null): string {
  if (!connection) return "local"
  switch (connection.kind) {
    case "system":
      return "sys"
    case "canvas":
    case "moodle":
      return "lms"
    case "import":
      return "import"
  }
}

/** Lowercase label from a raw connection kind string. */
export function connectionKindLabel(kind: string): string {
  switch (kind) {
    case "system":
      return "sys"
    case "canvas":
    case "moodle":
      return "lms"
    case "import":
      return "import"
    default:
      return "local"
  }
}

const badgeClass =
  "shrink-0 text-[10px] font-medium leading-none text-muted-foreground"

/** Pill-shaped micro-badge showing the connection type. */
export function ConnectionBadge({ label }: { label: string }) {
  return <span className={badgeClass}>{label}</span>
}
