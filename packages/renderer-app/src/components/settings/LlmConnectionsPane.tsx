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
  emptyLlmDraft,
  type LlmDraft,
  type LlmProviderKind,
  type PersistedLlmConnection,
  toLlmDraft,
  VERIFY_FAILED_MESSAGE,
  type VerificationStatus,
  VerificationStatusIcon,
} from "./ConnectionsPane.shared.js"

type LlmViewState =
  | { view: "list" }
  | { view: "editor"; originalId: string | null }

const PROVIDER_LABEL: Record<LlmProviderKind, string> = {
  claude: "Claude",
  codex: "Codex",
}

const AUTH_MODE_LABEL = {
  subscription: "Subscription",
  api: "API key",
} as const

export function LlmConnectionsPane() {
  const settings = useAppSettingsStore((state) => state.settings)
  const addLlmConnection = useAppSettingsStore(
    (state) => state.addLlmConnection,
  )
  const updateLlmConnection = useAppSettingsStore(
    (state) => state.updateLlmConnection,
  )
  const removeLlmConnection = useAppSettingsStore(
    (state) => state.removeLlmConnection,
  )
  const setActiveLlmConnectionId = useAppSettingsStore(
    (state) => state.setActiveLlmConnectionId,
  )
  const saveAppSettings = useAppSettingsStore((state) => state.save)
  const llmSavedStatuses = useConnectionsStore((state) => state.llmStatuses)
  const llmSavedErrors = useConnectionsStore((state) => state.llmErrors)
  const setLlmStatus = useConnectionsStore((state) => state.setLlmStatus)

  const llmConnections = settings.llmConnections
  const activeLlmConnectionId = settings.activeLlmConnectionId

  const [viewState, setViewState] = useState<LlmViewState>({ view: "list" })
  const [draft, setDraft] = useState<LlmDraft>(emptyLlmDraft())
  const [editorStatus, setEditorStatus] =
    useState<VerificationStatus>("disconnected")
  const [editorError, setEditorError] = useState<string | null>(null)

  const editorOriginalId =
    viewState.view === "editor" ? viewState.originalId : null
  const editing = viewState.view === "editor" && viewState.originalId !== null

  const nameTaken = useMemo(() => {
    const normalized = draft.name.trim().toLowerCase()
    if (!normalized) return false
    return llmConnections.some(
      (connection) =>
        connection.id !== editorOriginalId &&
        connection.name.trim().toLowerCase() === normalized,
    )
  }, [llmConnections, draft.name, editorOriginalId])

  const apiKeyMissing =
    draft.authMode === "api" && draft.apiKey.trim().length === 0

  const canSave = draft.name.trim().length > 0 && !nameTaken && !apiKeyMissing

  const hasChanges = useMemo(() => {
    if (!editing || editorOriginalId === null) return true
    const current = llmConnections.find((c) => c.id === editorOriginalId)
    if (!current) return true
    return (
      current.name !== draft.name.trim() ||
      current.provider !== draft.provider ||
      current.authMode !== draft.authMode ||
      (draft.authMode === "api" && current.apiKey !== draft.apiKey.trim())
    )
  }, [editing, llmConnections, draft, editorOriginalId])

  const canSubmit = canSave && (!editing || hasChanges)

  const resetEditor = () => {
    setViewState({ view: "list" })
    setDraft(emptyLlmDraft())
    setEditorStatus("disconnected")
    setEditorError(null)
  }

  const verify = async (d: LlmDraft) => {
    if (d.authMode === "api" && d.apiKey.trim().length === 0) {
      const message = "API key is required."
      setEditorStatus("error")
      setEditorError(message)
      return
    }
    setEditorStatus("verifying")
    setEditorError(null)
    try {
      const client = getWorkflowClient()
      const result = await client.run("connection.verifyLlmDraft", {
        provider: d.provider,
        authMode: d.authMode,
        apiKey: d.authMode === "api" ? d.apiKey.trim() : "",
      })
      if (result.verified) {
        setEditorStatus("connected")
        return
      }
      setEditorStatus("error")
      setEditorError(VERIFY_FAILED_MESSAGE)
    } catch (cause) {
      const message = getErrorMessage(cause)
      setEditorStatus("error")
      setEditorError(message)
    }
  }

  const handleSave = async () => {
    if (!canSubmit) return
    const id = editorOriginalId ?? crypto.randomUUID()
    const nextConnection: PersistedLlmConnection =
      draft.authMode === "subscription"
        ? {
            id,
            name: draft.name.trim(),
            provider: draft.provider,
            authMode: "subscription",
            apiKey: "",
          }
        : {
            id,
            name: draft.name.trim(),
            provider: draft.provider,
            authMode: "api",
            apiKey: draft.apiKey.trim(),
          }

    if (editorOriginalId === null) {
      addLlmConnection(nextConnection)
      // First connection becomes active automatically.
      if (activeLlmConnectionId === null) {
        setActiveLlmConnectionId(id)
      }
    } else {
      updateLlmConnection(editorOriginalId, nextConnection)
    }

    await saveAppSettings()
    resetEditor()
  }

  const handleRemove = async (id: string) => {
    removeLlmConnection(id)
    await saveAppSettings()
  }

  const handleVerifySaved = async (connection: PersistedLlmConnection) => {
    setLlmStatus(connection.id, "verifying", null)
    try {
      const client = getWorkflowClient()
      const result = await client.run("connection.verifyLlmDraft", {
        provider: connection.provider,
        authMode: connection.authMode,
        apiKey: connection.authMode === "api" ? connection.apiKey : "",
      })
      setLlmStatus(
        connection.id,
        result.verified ? "connected" : "error",
        result.verified ? null : VERIFY_FAILED_MESSAGE,
      )
    } catch (cause) {
      const message = getErrorMessage(cause)
      setLlmStatus(connection.id, "error", message)
    }
  }

  if (viewState.view === "editor") {
    return (
      <div className="space-y-3">
        <FormField label="Name" htmlFor="settings-llm-name">
          <Input
            id="settings-llm-name"
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="e.g., Personal Anthropic"
          />
        </FormField>
        <FormField label="Provider" htmlFor="settings-llm-provider">
          <Select
            value={draft.provider}
            onValueChange={(value) =>
              setDraft((current) => ({
                ...current,
                provider: value as LlmProviderKind,
              }))
            }
          >
            <SelectTrigger id="settings-llm-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude">Claude</SelectItem>
              <SelectItem value="codex">Codex</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Auth mode" htmlFor="settings-llm-auth-mode">
          <Select
            value={draft.authMode}
            onValueChange={(value) =>
              setDraft((current) => ({
                ...current,
                authMode: value as "subscription" | "api",
                apiKey: value === "subscription" ? "" : current.apiKey,
              }))
            }
          >
            <SelectTrigger id="settings-llm-auth-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="subscription">Subscription</SelectItem>
              <SelectItem value="api">API key</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        {draft.authMode === "api" && (
          <FormField
            label="API key"
            htmlFor="settings-llm-api-key"
            description="Stored in plain text inside the app settings file."
          >
            <PasswordInput
              id="settings-llm-api-key"
              value={draft.apiKey}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  apiKey: event.target.value,
                }))
              }
            />
          </FormField>
        )}

        {nameTaken && (
          <Text className="text-xs text-destructive">
            An LLM connection with this name already exists.
          </Text>
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
            variant="commit"
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
        <h3 className="font-medium">LLM Connections</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setViewState({ view: "editor", originalId: null })
            setDraft(emptyLlmDraft())
            setEditorStatus("disconnected")
            setEditorError(null)
          }}
        >
          <Plus className="size-4 mr-1" />
          Add
        </Button>
      </div>

      {llmConnections.length === 0 && (
        <Text className="text-sm text-muted-foreground">
          No LLM connections configured.
        </Text>
      )}

      <div className="space-y-2">
        {llmConnections.map((connection) => {
          const status = llmSavedStatuses[connection.id] ?? "disconnected"
          const error = llmSavedErrors[connection.id] ?? null
          const isActive = activeLlmConnectionId === connection.id
          return (
            <div
              key={connection.id}
              className="rounded-md border p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="active-llm-connection"
                      checked={isActive}
                      onChange={() => {
                        setActiveLlmConnectionId(connection.id)
                        void saveAppSettings()
                      }}
                      aria-label={`Use ${connection.name} for examination`}
                    />
                    <div className="font-medium text-sm truncate">
                      {connection.name}
                    </div>
                    <VerificationStatusIcon status={status} />
                  </label>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {PROVIDER_LABEL[connection.provider]} ·{" "}
                    {AUTH_MODE_LABEL[connection.authMode]}
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
                      setDraft(toLlmDraft(connection))
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
