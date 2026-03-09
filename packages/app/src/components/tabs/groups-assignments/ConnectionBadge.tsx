import type { GroupSetConnection } from "@repo-edu/domain"

export function connectionLabel(connection: GroupSetConnection | null): string {
  if (!connection) return "local"
  switch (connection.kind) {
    case "system":
      return "sys"
    case "canvas":
      return "canvas"
    case "moodle":
      return "moodle"
    case "import":
      return "import"
  }
}

const badgeClass =
  "shrink-0 text-[10px] font-medium leading-none text-muted-foreground"

export function ConnectionBadge({ label }: { label: string }) {
  return <span className={badgeClass}>{label}</span>
}
