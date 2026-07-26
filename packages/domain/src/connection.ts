import { z } from "zod"

export const lmsProviderKinds = ["canvas", "moodle"] as const
export type LmsProviderKind = (typeof lmsProviderKinds)[number]

export const gitProviderKinds = ["github", "gitlab", "gitea"] as const
export type GitProviderKind = (typeof gitProviderKinds)[number]

export const llmProviderKinds = ["claude", "codex"] as const
export type LlmProviderKind = (typeof llmProviderKinds)[number]

export const connectionBaseSchema = z
  .object({
    baseUrl: z.string(),
    token: z.string(),
    userAgent: z.string().optional(),
  })
  .strict()

export type ConnectionBase = z.infer<typeof connectionBaseSchema>

export const persistedLmsConnectionSchema = connectionBaseSchema
  .extend({
    id: z.string(),
    name: z.string(),
    provider: z.enum(lmsProviderKinds),
  })
  .strict()

export const persistedGitConnectionSchema = connectionBaseSchema
  .extend({
    id: z.string(),
    provider: z.enum(gitProviderKinds),
  })
  .strict()

export const DEFAULT_CLAUDE_API_MAX_TOKENS = 8192

const llmConnectionBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const llmApiKeySchema = z.string().min(1)
const claudeApiMaxTokensSchema = z.number().int().positive()

export const persistedLlmConnectionSchema = z.union([
  llmConnectionBaseSchema
    .extend({
      provider: z.literal("claude"),
      authMode: z.literal("subscription"),
      apiKey: z.literal(""),
    })
    .strict(),
  llmConnectionBaseSchema
    .extend({
      provider: z.literal("claude"),
      authMode: z.literal("api"),
      apiKey: llmApiKeySchema,
      maxTokens: claudeApiMaxTokensSchema,
    })
    .strict(),
  llmConnectionBaseSchema
    .extend({
      provider: z.literal("codex"),
      authMode: z.literal("subscription"),
      apiKey: z.literal(""),
    })
    .strict(),
  llmConnectionBaseSchema
    .extend({
      provider: z.literal("codex"),
      authMode: z.literal("api"),
      apiKey: llmApiKeySchema,
    })
    .strict(),
])

export type PersistedLmsConnection = z.infer<
  typeof persistedLmsConnectionSchema
>
export type PersistedGitConnection = z.infer<
  typeof persistedGitConnectionSchema
>
export type PersistedLlmConnection = z.infer<
  typeof persistedLlmConnectionSchema
>

export const gitProviderDefaultBaseUrls: Record<GitProviderKind, string> = {
  github: "https://github.com",
  gitlab: "https://gitlab.com",
  gitea: "",
}

const gitProviderDisplayLabels: Record<GitProviderKind, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
}

export function gitConnectionDisplayLabel(
  connection: Pick<PersistedGitConnection, "provider" | "baseUrl">,
): string {
  const label = gitProviderDisplayLabels[connection.provider]
  const defaultUrl = gitProviderDefaultBaseUrls[connection.provider]
  if (connection.baseUrl === defaultUrl || connection.baseUrl === "") {
    return label
  }
  const shortUrl = connection.baseUrl.replace(/^https?:\/\//, "")
  return `${label} · ${shortUrl}`
}

export const DEFAULT_USER_AGENT = "repo-edu"

export function normalizeUserAgent(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export function resolveUserAgent(draft: ConnectionBase): string {
  return normalizeUserAgent(draft.userAgent) ?? DEFAULT_USER_AGENT
}

function resolveSelectedConnection<TConnection extends { id: string }>(
  connections: readonly TConnection[],
  selectedId: string | null,
): TConnection | null {
  if (connections.length === 0) {
    return null
  }
  if (selectedId !== null) {
    const match = connections.find((connection) => connection.id === selectedId)
    if (match !== undefined) {
      return match
    }
  }
  return connections[0] ?? null
}

export function resolveActiveGitConnection(
  connections: readonly PersistedGitConnection[],
  selectedId: string | null,
): PersistedGitConnection | null {
  return resolveSelectedConnection(connections, selectedId)
}

export function resolveActiveLlmConnection(
  connections: readonly PersistedLlmConnection[],
  selectedId: string | null,
): PersistedLlmConnection | null {
  return resolveSelectedConnection(connections, selectedId)
}
