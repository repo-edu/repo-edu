import { parseURL } from "ufo"
import type { GitProviderKind } from "./connection.js"

/**
 * Provider-specific terminology for the repository-namespace concept. GitHub
 * and Gitea call this an "Organization"; GitLab calls it a "Group".
 */
export function gitNamespaceTerminology(
  provider: GitProviderKind | null | undefined,
): { readonly label: string; readonly sampleSlug: string } {
  if (provider === "gitlab") {
    return { label: "GitLab Group", sampleSlug: "course-group" }
  }
  return { label: "Organization", sampleSlug: "course-org" }
}

/**
 * Accepts either a bare namespace path (for example, `course-org` or
 * `parent/sub`) or a provider URL and returns the path expected by provider
 * operations. Leading and trailing slashes are removed.
 */
export function normalizeGitNamespaceInput(input: string): string {
  const trimmed = input.trim()
  const isProviderUrl = /^https?:\/\//i.test(trimmed)
  // Strip leading slashes before parsing bare paths so an input such as
  // "//parent/sub" is not read as a protocol-relative URL with host "parent".
  const parsed = parseURL(isProviderUrl ? trimmed : trimmed.replace(/^\/+/, ""))
  if (
    parsed.protocol !== undefined &&
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    return ""
  }
  return parsed.pathname.replace(/^\/+/, "").replace(/\/+$/, "")
}
