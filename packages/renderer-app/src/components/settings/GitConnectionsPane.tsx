import { normalizeUserAgent } from "@repo-edu/domain/connection"
import {
  gitConnectionDisplayLabel,
  gitProviderDefaultBaseUrls,
} from "@repo-edu/domain/settings"
import type { GitProviderKind } from "@repo-edu/domain/types"
import {
  Button,
  FormField,
  Input,
  PasswordInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui"
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "@repo-edu/ui/components/icons"
import { useMemo, useState } from "react"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { useConnectionsStore } from "../../stores/connections-store.js"
import { getErrorMessage } from "../../utils/error-message.js"
import {
  displayUrl,
  emptyGitDraft,
  type GitDraft,
  INVALID_REQUIRED_URL_MESSAGE,
  normalizeHttpUrl,
  type PersistedGitConnection,
  toGitDraft,
  VERIFY_FAILED_MESSAGE,
  type VerificationStatus,
  VerificationStatusIcon,
  validateRequiredBaseUrl,
} from "./ConnectionsPane.shared.js"

type GitViewState =
  | { view: "list" }
  | { view: "editor"; originalId: string | null }

export function GitConnectionsPane() {
  const settings = useAppSettingsStore((state) => state.settings)
  const addGitConnection = useAppSettingsStore(
    (state) => state.addGitConnection,
  )
  const updateGitConnection = useAppSettingsStore(
    (state) => state.updateGitConnection,
  )
  const removeGitConnection = useAppSettingsStore(
    (state) => state.removeGitConnection,
  )
  const saveAppSettings = useAppSettingsStore((state) => state.save)
  const gitSavedStatuses = useConnectionsStore((state) => state.gitStatuses)
  const gitSavedErrors = useConnectionsStore((state) => state.gitErrors)
  const setGitStatus = useConnectionsStore((state) => state.setGitStatus)

  const gitConnections = settings.gitConnections

  const [viewState, setViewState] = useState<GitViewState>({ view: "list" })
  const [draft, setDraft] = useState<GitDraft>(emptyGitDraft())
  const [editorStatus, setEditorStatus] =
    useState<VerificationStatus>("disconnected")
  const [editorError, setEditorError] = useState<string | null>(null)

  const editorOriginalId =
    viewState.view === "editor" ? viewState.originalId : null
  const editing = viewState.view === "editor" && viewState.originalId !== null

  const baseUrlError = validateRequiredBaseUrl(draft.baseUrl)

  const canSave =
    draft.baseUrl.trim().length > 0 &&
    draft.token.trim().length > 0 &&
    baseUrlError === null

  const hasChanges = useMemo(() => {
    if (!editing || editorOriginalId === null) return true
    const current = gitConnections.find(
      (connection) => connection.id === editorOriginalId,
    )
    if (!current) return true

    const normalizedBaseUrl = normalizeHttpUrl(draft.baseUrl, {
      allowImplicitHttps: true,
    })
    const nextBaseUrl = normalizedBaseUrl ?? draft.baseUrl.trim()
    const nextUserAgent = normalizeUserAgent(draft.userAgent)

    return (
      current.provider !== draft.provider ||
      current.baseUrl !== nextBaseUrl ||
      current.token !== draft.token.trim() ||
      current.userAgent !== nextUserAgent
    )
  }, [editing, gitConnections, draft, editorOriginalId])

  const canSubmit = canSave && (!editing || hasChanges)

  const resetEditor = () => {
    setViewState({ view: "list" })
    setDraft(emptyGitDraft())
    setEditorStatus("disconnected")
    setEditorError(null)
  }

  const verify = async (d: GitDraft) => {
    const normalizedBaseUrl = normalizeHttpUrl(d.baseUrl, {
      allowImplicitHttps: true,
    })
    const baseUrl = normalizedBaseUrl ?? d.baseUrl.trim()
    const token = d.token.trim()
    const urlError =
      normalizedBaseUrl === null ? INVALID_REQUIRED_URL_MESSAGE : null
    if (urlError) {
      setEditorStatus("error")
      setEditorError(urlError)
      return { status: "error" as const, error: urlError }
    }

    setEditorStatus("verifying")
    setEditorError(null)
    try {
      const client = getWorkflowClient()
      const result = await client.run("connection.verifyGitDraft", {
        provider: d.provider,
        baseUrl,
        token,
        userAgent: normalizeUserAgent(d.userAgent),
      })
      if (result.verified) {
        setEditorStatus("connected")
        return { status: "connected" as const, error: null }
      }

      setEditorStatus("error")
      setEditorError(VERIFY_FAILED_MESSAGE)
      return { status: "error" as const, error: VERIFY_FAILED_MESSAGE }
    } catch (cause) {
      const message = getErrorMessage(cause)
      setEditorStatus("error")
      setEditorError(message)
      return { status: "error" as const, error: message }
    }
  }

  const handleSave = async () => {
    if (!canSubmit) return
    const normalizedBaseUrl = normalizeHttpUrl(draft.baseUrl, {
      allowImplicitHttps: true,
    })
    if (normalizedBaseUrl === null) {
      setEditorError(INVALID_REQUIRED_URL_MESSAGE)
      return
    }

    const nextConnection: PersistedGitConnection = {
      id: editorOriginalId ?? crypto.randomUUID(),
      provider: draft.provider,
      baseUrl: normalizedBaseUrl,
      token: draft.token.trim(),
      userAgent: normalizeUserAgent(draft.userAgent),
    }

    if (editorOriginalId === null) {
      addGitConnection(nextConnection)
    } else {
      updateGitConnection(editorOriginalId, nextConnection)
    }

    await saveAppSettings()
    resetEditor()
  }

  const handleRemove = async (id: string) => {
    removeGitConnection(id)
    await saveAppSettings()
  }

  const handleVerifySaved = async (connection: PersistedGitConnection) => {
    const normalizedBaseUrl = normalizeHttpUrl(connection.baseUrl, {
      allowImplicitHttps: true,
    })
    if (normalizedBaseUrl === null) {
      setGitStatus(connection.id, "error", INVALID_REQUIRED_URL_MESSAGE)
      return
    }

    setGitStatus(connection.id, "verifying", null)
    try {
      const client = getWorkflowClient()
      const result = await client.run("connection.verifyGitDraft", {
        provider: connection.provider,
        baseUrl: normalizedBaseUrl,
        token: connection.token,
        userAgent: connection.userAgent,
      })
      setGitStatus(
        connection.id,
        result.verified ? "connected" : "error",
        result.verified ? null : VERIFY_FAILED_MESSAGE,
      )
    } catch (cause) {
      const message = getErrorMessage(cause)
      setGitStatus(connection.id, "error", message)
    }
  }

  if (viewState.view === "editor") {
    return (
      <div className="space-y-3">
        <FormField label="Provider" htmlFor="settings-git-provider">
          <Select
            value={draft.provider}
            onValueChange={(value) => {
              const provider = value as GitProviderKind
              setDraft((current) => ({
                ...current,
                provider,
                baseUrl: gitProviderDefaultBaseUrls[provider],
              }))
            }}
          >
            <SelectTrigger id="settings-git-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="github">GitHub</SelectItem>
              <SelectItem value="gitlab">GitLab</SelectItem>
              <SelectItem value="gitea">Gitea</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Base URL" htmlFor="settings-git-base-url">
          <Input
            id="settings-git-base-url"
            value={draft.baseUrl}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                baseUrl: event.target.value,
              }))
            }
            placeholder="https://git.example.edu"
          />
        </FormField>
        <FormField label="Access Token" htmlFor="settings-git-token">
          <PasswordInput
            id="settings-git-token"
            value={draft.token}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                token: event.target.value,
              }))
            }
          />
        </FormField>
        <FormField
          label="User-Agent (optional)"
          htmlFor="settings-git-user-agent"
          title="Identifies this application to the Git API."
          description="Identifies you to Git administrators. Recommended format: Name / Organization / email"
        >
          <Input
            id="settings-git-user-agent"
            value={draft.userAgent}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                userAgent: event.target.value,
              }))
            }
            placeholder="Your Name / Organization / email@university.edu"
            title="Identifies this application to the Git API."
          />
        </FormField>

        {baseUrlError && (
          <Text className="text-xs text-destructive">{baseUrlError}</Text>
        )}
        {editorError && (
          <Text className="text-xs text-destructive">{editorError}</Text>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void verify(draft)}
            disabled={!canSave || editorStatus === "verifying"}
          >
            {editorStatus === "verifying" ? (
              <>
                <Loader2 className="size-3.5 mr-1 animate-spin" />
                Verifying...
              </>
            ) : editorStatus === "connected" ? (
              <>
                <Check className="size-3.5 mr-1 text-success" />
                Verified
              </>
            ) : editorStatus === "error" ? (
              <>
                <X className="size-3.5 mr-1 text-destructive" />
                Retry Verify
              </>
            ) : (
              <>
                <Check className="size-3.5 mr-1" />
                Verify
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={!canSubmit}
          >
            {editing ? "Update connection" : "Add connection"}
          </Button>
          <Button size="sm" variant="outline" onClick={resetEditor}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Git Connections</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setViewState({ view: "editor", originalId: null })
            setDraft(emptyGitDraft())
            setEditorStatus("disconnected")
            setEditorError(null)
          }}
        >
          <Plus className="size-4 mr-1" />
          Add
        </Button>
      </div>

      {gitConnections.length === 0 && (
        <Text className="text-sm text-muted-foreground">
          No Git connections configured.
        </Text>
      )}

      <div className="space-y-2">
        {gitConnections.map((connection) => {
          const status = gitSavedStatuses[connection.id] ?? "disconnected"
          const error = gitSavedErrors[connection.id] ?? null
          return (
            <div
              key={connection.id}
              className="rounded-md border p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="font-medium text-sm truncate">
                      {gitConnectionDisplayLabel(connection)}
                    </div>
                    <VerificationStatusIcon status={status} />
                  </div>
                  <div
                    className="text-xs text-muted-foreground truncate"
                    title={connection.baseUrl}
                  >
                    {displayUrl(connection.baseUrl)}
                  </div>
                  {error && (
                    <div className="text-xs text-destructive mt-1">{error}</div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleVerifySaved(connection)}
                  >
                    <RefreshCw className="size-3.5 mr-1" />
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setViewState({
                        view: "editor",
                        originalId: connection.id,
                      })
                      setDraft(toGitDraft(connection))
                      setEditorStatus("disconnected")
                      setEditorError(null)
                    }}
                  >
                    <Pencil className="size-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRemove(connection.id)}
                  >
                    <Trash2 className="size-3.5 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
