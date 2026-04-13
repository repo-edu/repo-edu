import {
  gitProviderDefaultBaseUrls,
  type PersistedGitConnection,
  type PersistedLmsConnection,
} from "@repo-edu/domain/settings"
import type { GitProviderKind, LmsProviderKind } from "@repo-edu/domain/types"
import { Check, Loader2, X } from "@repo-edu/ui/components/icons"
import type { ConnectionStatus } from "../../types/index.js"

export type VerificationStatus = ConnectionStatus

export type LmsDraft = Omit<PersistedLmsConnection, "userAgent"> & {
  userAgent: string
}

export type GitDraft = {
  provider: GitProviderKind
  baseUrl: string
  token: string
}

export const INVALID_REQUIRED_URL_MESSAGE =
  "Base URL must be a valid http(s) URL."

export const VERIFY_FAILED_MESSAGE =
  "Verification failed. Check URL and credentials."

export function normalizeHttpUrl(
  value: string,
  options?: { allowImplicitHttps?: boolean },
): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return ""
  }

  const candidate =
    options?.allowImplicitHttps && !trimmed.includes("://")
      ? `https://${trimmed}`
      : trimmed

  try {
    const url = new URL(candidate)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null
    }

    return url.toString().replace(/\/+$/, "")
  } catch {
    return null
  }
}

export function validateRequiredBaseUrl(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  return normalizeHttpUrl(trimmed, { allowImplicitHttps: true }) === null
    ? INVALID_REQUIRED_URL_MESSAGE
    : null
}

export function VerificationStatusIcon({
  status,
}: {
  status: VerificationStatus
}) {
  switch (status) {
    case "connected":
      return <Check className="size-4 text-success" />
    case "verifying":
      return <Loader2 className="size-4 animate-spin" />
    case "error":
      return <X className="size-4 text-destructive" />
    default:
      return null
  }
}

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "")
}

export function emptyLmsDraft(): LmsDraft {
  return {
    name: "",
    provider: "canvas",
    baseUrl: "",
    token: "",
    userAgent: "",
  }
}

export function emptyGitDraft(): GitDraft {
  return {
    provider: "github",
    baseUrl: gitProviderDefaultBaseUrls.github,
    token: "",
  }
}

export function toOptionalUserAgent(value: string): string | undefined {
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

export function toLmsDraft(connection: PersistedLmsConnection): LmsDraft {
  return {
    ...connection,
    userAgent: connection.userAgent ?? "",
  }
}

export type { LmsProviderKind, PersistedGitConnection, PersistedLmsConnection }
