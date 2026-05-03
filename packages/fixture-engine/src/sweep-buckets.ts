import type {
  LlmAuthMode,
  LlmError,
  LlmProvider,
} from "@repo-edu/integrations-llm-contract"

export interface CappedBucket {
  provider: LlmProvider
  authMode: LlmAuthMode | null
  kind: "rate_limit" | "quota_exhausted"
}

export function bucketLabel(b: CappedBucket): string {
  const auth = b.authMode ?? "unknown"
  return `${b.provider}/${auth}`
}

export function findCappedBucket(
  buckets: readonly CappedBucket[],
  provider: LlmProvider,
): CappedBucket | undefined {
  // Within a single process the auth mode is deterministic per provider, so
  // any cap on a provider blocks every later variant of that provider.
  return buckets.find((b) => b.provider === provider)
}

export function recordCapFromError(
  buckets: CappedBucket[],
  err: LlmError,
  fallbackProvider: LlmProvider,
): CappedBucket {
  const provider = err.context.provider ?? fallbackProvider
  const authMode = err.context.authMode ?? null
  const existing = buckets.find(
    (b) => b.provider === provider && b.authMode === authMode,
  )
  if (existing) return existing
  const bucket: CappedBucket = {
    provider,
    authMode,
    kind: err.kind === "quota_exhausted" ? "quota_exhausted" : "rate_limit",
  }
  buckets.push(bucket)
  return bucket
}
