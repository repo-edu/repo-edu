import { normalizeUserAgent } from "@repo-edu/domain/connection"
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
  emptyLmsDraft,
  INVALID_REQUIRED_URL_MESSAGE,
  LMS_PROVIDER_LABEL,
  type LmsDraft,
  type LmsProviderKind,
  lmsConnectionDisplayName,
  normalizeHttpUrl,
  type PersistedLmsConnection,
  toLmsDraft,
  VERIFY_FAILED_MESSAGE,
  type VerificationStatus,
  VerificationStatusIcon,
  validateRequiredBaseUrl,
} from "./ConnectionsPane.shared.js"

type LmsViewState =
  | { view: "list" }
  | { view: "editor"; originalId: string | null }

export function LmsConnectionsPane() {
  const settings = useAppSettingsStore((state) => state.settings)
  const addLmsConnection = useAppSettingsStore(
    (state) => state.addLmsConnection,
  )
  const updateLmsConnection = useAppSettingsStore(
    (state) => state.updateLmsConnection,
  )
  const removeLmsConnection = useAppSettingsStore(
    (state) => state.removeLmsConnection,
  )
  const lmsSavedStatuses = useConnectionsStore((state) => state.lmsStatuses)
  const lmsSavedErrors = useConnectionsStore((state) => state.lmsErrors)
  const setLmsConnectionStatus = useConnectionsStore(
    (state) => state.setLmsConnectionStatus,
  )

  const lmsConnections = settings.lmsConnections

  const [viewState, setViewState] = useState<LmsViewState>({ view: "list" })
  const [draft, setDraft] = useState<LmsDraft>(emptyLmsDraft())
  const [editorStatus, setEditorStatus] =
    useState<VerificationStatus>("disconnected")
  const [editorError, setEditorError] = useState<string | null>(null)

  const editorOriginalId =
    viewState.view === "editor" ? viewState.originalId : null
  const editing = viewState.view === "editor" && viewState.originalId !== null

  const draftDisplayName = useMemo(
    () => draft.name.trim() || LMS_PROVIDER_LABEL[draft.provider],
    [draft.name, draft.provider],
  )

  const nameTaken = useMemo(() => {
    const normalized = draftDisplayName.toLowerCase()
    return lmsConnections.some(
      (connection) =>
        connection.id !== editorOriginalId &&
        lmsConnectionDisplayName(connection).toLowerCase() === normalized,
    )
  }, [lmsConnections, draftDisplayName, editorOriginalId])

  const nameTakenMessage = useMemo(() => {
    if (!nameTaken) return null
    if (draft.name.trim().length === 0) {
      return `A ${LMS_PROVIDER_LABEL[draft.provider]} connection already exists. Give this one a name.`
    }
    return "An LMS connection with this name already exists."
  }, [nameTaken, draft.name, draft.provider])

  const baseUrlError = validateRequiredBaseUrl(draft.baseUrl)

  const canSave =
    draft.baseUrl.trim().length > 0 &&
    draft.token.trim().length > 0 &&
    baseUrlError === null &&
    !nameTaken

  const hasChanges = useMemo(() => {
    if (!editing || editorOriginalId === null) return true
    const current = lmsConnections.find((c) => c.id === editorOriginalId)
    if (!current) return true

    const normalizedBaseUrl = normalizeHttpUrl(draft.baseUrl, {
      allowImplicitHttps: true,
    })
    const nextBaseUrl = normalizedBaseUrl ?? draft.baseUrl.trim()
    const nextUserAgent = normalizeUserAgent(draft.userAgent)

    return (
      current.name !== draft.name.trim() ||
      current.provider !== draft.provider ||
      current.baseUrl !== nextBaseUrl ||
      current.token !== draft.token.trim() ||
      current.userAgent !== nextUserAgent
    )
  }, [editing, lmsConnections, draft, editorOriginalId])

  const canSubmit = canSave && (!editing || hasChanges)

  const resetEditor = () => {
    setViewState({ view: "list" })
    setDraft(emptyLmsDraft())
    setEditorStatus("disconnected")
    setEditorError(null)
  }

  const verify = async (d: LmsDraft) => {
    const normalizedBaseUrl = normalizeHttpUrl(d.baseUrl, {
      allowImplicitHttps: true,
    })
    const baseUrl = normalizedBaseUrl ?? d.baseUrl.trim()
    const token = d.token.trim()
    const userAgent = normalizeUserAgent(d.userAgent)
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
      const result = await client.run("connection.verifyLmsDraft", {
        provider: d.provider,
        baseUrl,
        token,
        userAgent,
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

  const handleSave = () => {
    if (!canSubmit) return
    const normalizedBaseUrl = normalizeHttpUrl(draft.baseUrl, {
      allowImplicitHttps: true,
    })
    if (normalizedBaseUrl === null) {
      setEditorError(INVALID_REQUIRED_URL_MESSAGE)
      return
    }

    const id = editorOriginalId ?? crypto.randomUUID()
    const nextConnection: PersistedLmsConnection = {
      id,
      name: draft.name.trim(),
      provider: draft.provider,
      baseUrl: normalizedBaseUrl,
      token: draft.token.trim(),
      userAgent: normalizeUserAgent(draft.userAgent),
    }

    if (editorOriginalId === null) {
      addLmsConnection(nextConnection)
    } else {
      updateLmsConnection(editorOriginalId, nextConnection)
    }

    resetEditor()
  }

  const handleRemove = (id: string) => {
    removeLmsConnection(id)
  }

  const handleVerifySaved = async (connection: PersistedLmsConnection) => {
    const normalizedBaseUrl = normalizeHttpUrl(connection.baseUrl, {
      allowImplicitHttps: true,
    })
    if (normalizedBaseUrl === null) {
      setLmsConnectionStatus(
        connection.id,
        "error",
        INVALID_REQUIRED_URL_MESSAGE,
      )
      return
    }

    setLmsConnectionStatus(connection.id, "verifying", null)
    try {
      const client = getWorkflowClient()
      const result = await client.run("connection.verifyLmsDraft", {
        provider: connection.provider,
        baseUrl: normalizedBaseUrl,
        token: connection.token,
        userAgent: connection.userAgent,
      })
      setLmsConnectionStatus(
        connection.id,
        result.verified ? "connected" : "error",
        result.verified ? null : VERIFY_FAILED_MESSAGE,
      )
    } catch (cause) {
      const message = getErrorMessage(cause)
      setLmsConnectionStatus(connection.id, "error", message)
    }
  }

  if (viewState.view === "editor") {
    return (
      <div className="space-y-3">
        <FormField
          label="Name"
          htmlFor="settings-lms-name"
          description="Optional. Defaults to the provider name when a single connection per provider is enough."
        >
          <Input
            id="settings-lms-name"
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder={LMS_PROVIDER_LABEL[draft.provider]}
          />
        </FormField>
        <FormField label="Provider" htmlFor="settings-lms-provider">
          <Select
            value={draft.provider}
            onValueChange={(value) =>
              setDraft((current) => ({
                ...current,
                provider: value as LmsProviderKind,
              }))
            }
          >
            <SelectTrigger id="settings-lms-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="canvas">Canvas</SelectItem>
              <SelectItem value="moodle">Moodle</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Base URL" htmlFor="settings-lms-base-url">
          <Input
            id="settings-lms-base-url"
            value={draft.baseUrl}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                baseUrl: event.target.value,
              }))
            }
            placeholder="https://canvas.example.edu"
          />
        </FormField>
        <FormField label="Access Token" htmlFor="settings-lms-token">
          <PasswordInput
            id="settings-lms-token"
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
          htmlFor="settings-lms-user-agent"
          title="Identifies this application to the LMS API."
          description="Identifies you to LMS administrators. Recommended format: Name / Organization / email"
        >
          <Input
            id="settings-lms-user-agent"
            value={draft.userAgent}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                userAgent: event.target.value,
              }))
            }
            placeholder="Your Name / Organization / email@university.edu"
            title="Identifies this application to the LMS API."
          />
        </FormField>

        {nameTakenMessage && (
          <Text className="text-xs text-destructive">{nameTakenMessage}</Text>
        )}
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
        <h3 className="font-medium">LMS Connections</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setViewState({ view: "editor", originalId: null })
            setDraft(emptyLmsDraft())
            setEditorStatus("disconnected")
            setEditorError(null)
          }}
        >
          <Plus className="size-4 mr-1" />
          Add
        </Button>
      </div>

      {lmsConnections.length === 0 && (
        <Text className="text-sm text-muted-foreground">
          No LMS connections configured.
        </Text>
      )}

      <div className="space-y-2">
        {lmsConnections.map((connection) => {
          const status = lmsSavedStatuses[connection.id] ?? "disconnected"
          const error = lmsSavedErrors[connection.id] ?? null
          const displayName = lmsConnectionDisplayName(connection)
          return (
            <div
              key={connection.id}
              className="rounded-md border p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="font-medium text-sm truncate">
                      {displayName}
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
                      setDraft(toLmsDraft(connection))
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

// ---------------------------------------------------------------------------
// Git Connections Pane
// ---------------------------------------------------------------------------
