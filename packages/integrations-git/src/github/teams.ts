import type { CreateTeamRequest } from "@repo-edu/integrations-git-contract"

export function mapTeamPermission(permission: CreateTeamRequest["permission"]) {
  if (permission === "admin") {
    return "admin" as const
  }
  if (permission === "pull") {
    return "pull" as const
  }
  return "push" as const
}

export function mapTeamRole(permission: CreateTeamRequest["permission"]) {
  return permission === "push" || permission === "admin"
    ? ("maintainer" as const)
    : ("member" as const)
}

export function teamSlugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
