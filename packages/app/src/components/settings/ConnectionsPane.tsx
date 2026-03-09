import type {
  GitProviderKind,
  LmsProviderKind,
  PersistedGitConnection,
  PersistedLmsConnection,
} from "@repo-edu/domain"
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
import type { ConnectionStatus } from "../../types/index.js"
import { getErrorMessage } from "../../utils/error-message.js"

type VerificationStatus = ConnectionStatus

type LmsDraft = PersistedLmsConnection
type GitDraft = PersistedGitConnection

const LMS_PROVIDER_LABELS: Record<LmsProviderKind, string> = {
  canvas: "Canvas",
  moodle: "Moodle",
}

const GIT_PROVIDER_LABELS: Record<GitProviderKind, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
}

const INVALID_REQUIRED_URL_MESSAGE = "Base URL must be a valid http(s) URL."
const INVALID_OPTIONAL_URL_MESSAGE =
  "Base URL must be a valid http(s) URL when provided."
const VERIFY_FAILED_MESSAGE = "Verification failed. Check URL and credentials."

function normalizeHttpUrl(
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

function validateRequiredBaseUrl(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  return normalizeHttpUrl(trimmed, { allowImplicitHttps: true }) === null
    ? INVALID_REQUIRED_URL_MESSAGE
    : null
}

function validateOptionalBaseUrl(value: string | null): string | null {
  const normalized = value?.trim() ?? ""
  if (normalized.length === 0) {
    return null
  }

  return normalizeHttpUrl(normalized) === null
    ? INVALID_OPTIONAL_URL_MESSAGE
    : null
}

function VerificationStatusIcon({ status }: { status: VerificationStatus }) {
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

function emptyLmsDraft(): LmsDraft {
  return {
    name: "",
    provider: "canvas",
    baseUrl: "",
    token: "",
  }
}

function emptyGitDraft(): GitDraft {
  return {
    name: "",
    provider: "github",
    baseUrl: null,
    token: "",
    organization: null,
  }
}

export function ConnectionsPane() {
  const settings = useAppSettingsStore((state) => state.settings)
  const setLmsConnection = useAppSettingsStore(
    (state) => state.setLmsConnection,
  )
  const addLmsConnection = useAppSettingsStore(
    (state) => state.addLmsConnection,
  )
  const removeLmsConnection = useAppSettingsStore(
    (state) => state.removeLmsConnection,
  )
  const addGitConnection = useAppSettingsStore(
    (state) => state.addGitConnection,
  )
  const updateGitConnection = useAppSettingsStore(
    (state) => state.updateGitConnection,
  )
  const renameGitConnection = useAppSettingsStore(
    (state) => state.renameGitConnection,
  )
  const removeGitConnection = useAppSettingsStore(
    (state) => state.removeGitConnection,
  )
  const saveAppSettings = useAppSettingsStore((state) => state.save)
  const lmsSavedStatuses = useConnectionsStore((state) => state.lmsStatuses)
  const lmsSavedErrors = useConnectionsStore((state) => state.lmsErrors)
  const gitSavedStatuses = useConnectionsStore((state) => state.gitStatuses)
  const gitSavedErrors = useConnectionsStore((state) => state.gitErrors)
  const setLmsConnectionStatus = useConnectionsStore(
    (state) => state.setLmsConnectionStatus,
  )
  const setGitStatus = useConnectionsStore((state) => state.setGitStatus)

  const lmsConnections = settings.lmsConnections
  const gitConnections = settings.gitConnections

  const [showLmsEditor, setShowLmsEditor] = useState(false)
  const [lmsEditorIndex, setLmsEditorIndex] = useState<number | null>(null)
  const [lmsDraft, setLmsDraft] = useState<LmsDraft>(emptyLmsDraft())
  const [lmsEditorStatus, setLmsEditorStatus] =
    useState<VerificationStatus>("disconnected")
  const [lmsEditorError, setLmsEditorError] = useState<string | null>(null)

  const [showGitEditor, setShowGitEditor] = useState(false)
  const [gitEditorOriginalName, setGitEditorOriginalName] = useState<
    string | null
  >(null)
  const [gitDraft, setGitDraft] = useState<GitDraft>(emptyGitDraft())
  const [gitEditorStatus, setGitEditorStatus] =
    useState<VerificationStatus>("disconnected")
  const [gitEditorError, setGitEditorError] = useState<string | null>(null)

  const editingLms = showLmsEditor && lmsEditorIndex !== null
  const editingGit = showGitEditor && gitEditorOriginalName !== null

  const lmsNameTaken = useMemo(() => {
    const normalized = lmsDraft.name.trim().toLowerCase()
    if (!normalized) return false
    return lmsConnections.some(
      (connection, index) =>
        index !== lmsEditorIndex &&
        connection.name.trim().toLowerCase() === normalized,
    )
  }, [lmsConnections, lmsDraft.name, lmsEditorIndex])

  const gitNameTaken = useMemo(() => {
    const normalized = gitDraft.name.trim().toLowerCase()
    if (!normalized) return false
    return gitConnections.some(
      (connection) =>
        connection.name.trim().toLowerCase() === normalized &&
        connection.name !== gitEditorOriginalName,
    )
  }, [gitConnections, gitDraft.name, gitEditorOriginalName])

  const lmsBaseUrlError = validateRequiredBaseUrl(lmsDraft.baseUrl)
  const gitBaseUrlError = validateOptionalBaseUrl(gitDraft.baseUrl)

  const canSaveLms =
    lmsDraft.name.trim().length > 0 &&
    lmsDraft.baseUrl.trim().length > 0 &&
    lmsDraft.token.trim().length > 0 &&
    lmsBaseUrlError === null &&
    !lmsNameTaken

  const canSaveGit =
    gitDraft.name.trim().length > 0 &&
    gitDraft.token.trim().length > 0 &&
    gitBaseUrlError === null &&
    !gitNameTaken

  const resetLmsEditor = () => {
    setShowLmsEditor(false)
    setLmsEditorIndex(null)
    setLmsDraft(emptyLmsDraft())
    setLmsEditorStatus("disconnected")
    setLmsEditorError(null)
  }

  const resetGitEditor = () => {
    setShowGitEditor(false)
    setGitEditorOriginalName(null)
    setGitDraft(emptyGitDraft())
    setGitEditorStatus("disconnected")
    setGitEditorError(null)
  }

  const verifyLms = async (draft: LmsDraft) => {
    const normalizedBaseUrl = normalizeHttpUrl(draft.baseUrl, {
      allowImplicitHttps: true,
    })
    const baseUrl = normalizedBaseUrl ?? draft.baseUrl.trim()
    const token = draft.token.trim()
    const urlError =
      normalizedBaseUrl === null ? INVALID_REQUIRED_URL_MESSAGE : null
    if (urlError) {
      setLmsEditorStatus("error")
      setLmsEditorError(urlError)
      return { status: "error" as const, error: urlError }
    }

    setLmsEditorStatus("verifying")
    setLmsEditorError(null)
    try {
      const client = getWorkflowClient()
      const result = await client.run("connection.verifyLmsDraft", {
        provider: draft.provider,
        baseUrl,
        token,
      })
      if (result.verified) {
        setLmsEditorStatus("connected")
        return { status: "connected" as const, error: null }
      }

      setLmsEditorStatus("error")
      setLmsEditorError(VERIFY_FAILED_MESSAGE)
      return { status: "error" as const, error: VERIFY_FAILED_MESSAGE }
    } catch (cause) {
      const message = getErrorMessage(cause)
      setLmsEditorStatus("error")
      setLmsEditorError(message)
      return { status: "error" as const, error: message }
    }
  }

  const verifyGit = async (draft: GitDraft) => {
    const baseUrl = draft.baseUrl?.trim() || null
    const token = draft.token.trim()
    const organization = draft.organization?.trim() || null
    const urlError = validateOptionalBaseUrl(baseUrl)
    if (urlError) {
      setGitEditorStatus("error")
      setGitEditorError(urlError)
      return { status: "error" as const, error: urlError }
    }

    setGitEditorStatus("verifying")
    setGitEditorError(null)
    try {
      const client = getWorkflowClient()
      const result = await client.run("connection.verifyGitDraft", {
        provider: draft.provider,
        baseUrl,
        token,
        organization,
      })
      if (result.verified) {
        setGitEditorStatus("connected")
        return { status: "connected" as const, error: null }
      }

      setGitEditorStatus("error")
      setGitEditorError(VERIFY_FAILED_MESSAGE)
      return { status: "error" as const, error: VERIFY_FAILED_MESSAGE }
    } catch (cause) {
      const message = getErrorMessage(cause)
      setGitEditorStatus("error")
      setGitEditorError(message)
      return { status: "error" as const, error: message }
    }
  }

  const handleSaveLms = async () => {
    if (!canSaveLms) return
    const normalizedBaseUrl = normalizeHttpUrl(lmsDraft.baseUrl, {
      allowImplicitHttps: true,
    })
    if (normalizedBaseUrl === null) {
      setLmsEditorError(INVALID_REQUIRED_URL_MESSAGE)
      return
    }

    const nextConnection: PersistedLmsConnection = {
      name: lmsDraft.name.trim(),
      provider: lmsDraft.provider,
      baseUrl: normalizedBaseUrl,
      token: lmsDraft.token.trim(),
    }

    if (lmsEditorIndex === null) {
      addLmsConnection(nextConnection)
    } else {
      setLmsConnection(lmsEditorIndex, nextConnection)
    }

    await saveAppSettings()
    resetLmsEditor()
  }

  const handleSaveGit = async () => {
    if (!canSaveGit) return
    const urlError = validateOptionalBaseUrl(gitDraft.baseUrl)
    if (urlError) {
      setGitEditorError(urlError)
      return
    }

    const nextConnection: PersistedGitConnection = {
      name: gitDraft.name.trim(),
      provider: gitDraft.provider,
      baseUrl: gitDraft.baseUrl?.trim() || null,
      token: gitDraft.token.trim(),
      organization: gitDraft.organization?.trim() || null,
    }

    if (gitEditorOriginalName === null) {
      addGitConnection(nextConnection)
    } else if (gitEditorOriginalName !== nextConnection.name) {
      renameGitConnection(
        gitEditorOriginalName,
        nextConnection.name,
        nextConnection,
      )
    } else {
      updateGitConnection(gitEditorOriginalName, nextConnection)
    }

    await saveAppSettings()
    resetGitEditor()
  }

  const handleRemoveLms = async (index: number) => {
    removeLmsConnection(index)
    await saveAppSettings()
  }

  const handleRemoveGit = async (name: string) => {
    removeGitConnection(name)
    await saveAppSettings()
  }

  const handleVerifySavedLms = async (connection: PersistedLmsConnection) => {
    const normalizedBaseUrl = normalizeHttpUrl(connection.baseUrl, {
      allowImplicitHttps: true,
    })
    if (normalizedBaseUrl === null) {
      setLmsConnectionStatus(
        connection.name,
        "error",
        INVALID_REQUIRED_URL_MESSAGE,
      )
      return
    }

    setLmsConnectionStatus(connection.name, "verifying", null)
    try {
      const client = getWorkflowClient()
      const result = await client.run("connection.verifyLmsDraft", {
        provider: connection.provider,
        baseUrl: normalizedBaseUrl,
        token: connection.token,
      })
      setLmsConnectionStatus(
        connection.name,
        result.verified ? "connected" : "error",
        result.verified ? null : VERIFY_FAILED_MESSAGE,
      )
    } catch (cause) {
      const message = getErrorMessage(cause)
      setLmsConnectionStatus(connection.name, "error", message)
    }
  }

  const handleVerifySavedGit = async (connection: PersistedGitConnection) => {
    const urlError = validateOptionalBaseUrl(connection.baseUrl)
    if (urlError) {
      setGitStatus(connection.name, "error", urlError)
      return
    }

    setGitStatus(connection.name, "verifying", null)
    try {
      const client = getWorkflowClient()
      const result = await client.run("connection.verifyGitDraft", {
        provider: connection.provider,
        baseUrl: connection.baseUrl,
        token: connection.token,
        organization: connection.organization,
      })
      setGitStatus(
        connection.name,
        result.verified ? "connected" : "error",
        result.verified ? null : VERIFY_FAILED_MESSAGE,
      )
    } catch (cause) {
      const message = getErrorMessage(cause)
      setGitStatus(connection.name, "error", message)
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">LMS Connections</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowLmsEditor(true)
              setLmsEditorIndex(null)
              setLmsDraft(emptyLmsDraft())
              setLmsEditorStatus("disconnected")
              setLmsEditorError(null)
            }}
            disabled={showLmsEditor}
          >
            <Plus className="size-4 mr-1" />
            Add
          </Button>
        </div>

        {lmsConnections.length === 0 && !showLmsEditor && (
          <Text className="text-sm text-muted-foreground">
            No LMS connections configured.
          </Text>
        )}

        <div className="space-y-2">
          {lmsConnections.map((connection, index) => {
            const status = lmsSavedStatuses[connection.name] ?? "disconnected"
            const error = lmsSavedErrors[connection.name] ?? null
            return (
              <div
                key={connection.name}
                className="rounded-md border p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <div className="font-medium text-sm">
                        {connection.name}
                      </div>
                      <VerificationStatusIcon status={status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {LMS_PROVIDER_LABELS[connection.provider]} ·{" "}
                      {connection.baseUrl}
                    </div>
                    {error && (
                      <div className="text-xs text-destructive mt-1">
                        {error}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleVerifySavedLms(connection)}
                    >
                      <RefreshCw className="size-3.5 mr-1" />
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowLmsEditor(true)
                        setLmsEditorIndex(index)
                        setLmsDraft(connection)
                        setLmsEditorStatus("disconnected")
                        setLmsEditorError(null)
                      }}
                    >
                      <Pencil className="size-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRemoveLms(index)}
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

        {showLmsEditor && (
          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm font-medium">
              {editingLms ? "Edit LMS Connection" : "New LMS Connection"}
            </div>
            <FormField label="Name" htmlFor="settings-lms-name">
              <Input
                id="settings-lms-name"
                value={lmsDraft.name}
                onChange={(event) =>
                  setLmsDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g., Canvas Production"
              />
            </FormField>
            <FormField label="Provider" htmlFor="settings-lms-provider">
              <Select
                value={lmsDraft.provider}
                onValueChange={(value) =>
                  setLmsDraft((current) => ({
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
                value={lmsDraft.baseUrl}
                onChange={(event) =>
                  setLmsDraft((current) => ({
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
                value={lmsDraft.token}
                onChange={(event) =>
                  setLmsDraft((current) => ({
                    ...current,
                    token: event.target.value,
                  }))
                }
              />
            </FormField>

            {lmsNameTaken && (
              <Text className="text-xs text-destructive">
                An LMS connection with this name already exists.
              </Text>
            )}
            {lmsBaseUrlError && (
              <Text className="text-xs text-destructive">
                {lmsBaseUrlError}
              </Text>
            )}
            {lmsEditorError && (
              <Text className="text-xs text-destructive">{lmsEditorError}</Text>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void verifyLms(lmsDraft)}
                disabled={!canSaveLms || lmsEditorStatus === "verifying"}
              >
                {lmsEditorStatus === "verifying" ? (
                  <>
                    <Loader2 className="size-3.5 mr-1 animate-spin" />
                    Verifying...
                  </>
                ) : lmsEditorStatus === "connected" ? (
                  <>
                    <Check className="size-3.5 mr-1 text-success" />
                    Verified
                  </>
                ) : lmsEditorStatus === "error" ? (
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
                onClick={() => void handleSaveLms()}
                disabled={!canSaveLms}
              >
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={resetLmsEditor}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Git Connections</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowGitEditor(true)
              setGitEditorOriginalName(null)
              setGitDraft(emptyGitDraft())
              setGitEditorStatus("disconnected")
              setGitEditorError(null)
            }}
            disabled={showGitEditor}
          >
            <Plus className="size-4 mr-1" />
            Add
          </Button>
        </div>

        {gitConnections.length === 0 && !showGitEditor && (
          <Text className="text-sm text-muted-foreground">
            No Git connections configured.
          </Text>
        )}

        <div className="space-y-2">
          {gitConnections.map((connection) => {
            const status = gitSavedStatuses[connection.name] ?? "disconnected"
            const error = gitSavedErrors[connection.name] ?? null
            return (
              <div
                key={connection.name}
                className="rounded-md border p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <div className="font-medium text-sm">
                        {connection.name}
                      </div>
                      <VerificationStatusIcon status={status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {GIT_PROVIDER_LABELS[connection.provider]} ·{" "}
                      {connection.baseUrl ?? "default base URL"}
                      {connection.organization
                        ? ` · org: ${connection.organization}`
                        : ""}
                    </div>
                    {error && (
                      <div className="text-xs text-destructive mt-1">
                        {error}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleVerifySavedGit(connection)}
                    >
                      <RefreshCw className="size-3.5 mr-1" />
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowGitEditor(true)
                        setGitEditorOriginalName(connection.name)
                        setGitDraft(connection)
                        setGitEditorStatus("disconnected")
                        setGitEditorError(null)
                      }}
                    >
                      <Pencil className="size-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRemoveGit(connection.name)}
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

        {showGitEditor && (
          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm font-medium">
              {editingGit ? "Edit Git Connection" : "New Git Connection"}
            </div>
            <FormField label="Name" htmlFor="settings-git-name">
              <Input
                id="settings-git-name"
                value={gitDraft.name}
                onChange={(event) =>
                  setGitDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g., Course GitHub"
              />
            </FormField>
            <FormField label="Provider" htmlFor="settings-git-provider">
              <Select
                value={gitDraft.provider}
                onValueChange={(value) =>
                  setGitDraft((current) => ({
                    ...current,
                    provider: value as GitProviderKind,
                  }))
                }
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
            <FormField
              label="Base URL (optional)"
              htmlFor="settings-git-base-url"
            >
              <Input
                id="settings-git-base-url"
                value={gitDraft.baseUrl ?? ""}
                onChange={(event) =>
                  setGitDraft((current) => ({
                    ...current,
                    baseUrl: event.target.value || null,
                  }))
                }
                placeholder="https://git.example.edu"
              />
            </FormField>
            <FormField
              label="Organization (optional)"
              htmlFor="settings-git-organization"
            >
              <Input
                id="settings-git-organization"
                value={gitDraft.organization ?? ""}
                onChange={(event) =>
                  setGitDraft((current) => ({
                    ...current,
                    organization: event.target.value || null,
                  }))
                }
                placeholder="e.g., course-org"
              />
            </FormField>
            <FormField label="Access Token" htmlFor="settings-git-token">
              <PasswordInput
                id="settings-git-token"
                value={gitDraft.token}
                onChange={(event) =>
                  setGitDraft((current) => ({
                    ...current,
                    token: event.target.value,
                  }))
                }
              />
            </FormField>

            {gitNameTaken && (
              <Text className="text-xs text-destructive">
                A Git connection with this name already exists.
              </Text>
            )}
            {gitBaseUrlError && (
              <Text className="text-xs text-destructive">
                {gitBaseUrlError}
              </Text>
            )}
            {gitEditorError && (
              <Text className="text-xs text-destructive">{gitEditorError}</Text>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void verifyGit(gitDraft)}
                disabled={!canSaveGit || gitEditorStatus === "verifying"}
              >
                {gitEditorStatus === "verifying" ? (
                  <>
                    <Loader2 className="size-3.5 mr-1 animate-spin" />
                    Verifying...
                  </>
                ) : gitEditorStatus === "connected" ? (
                  <>
                    <Check className="size-3.5 mr-1 text-success" />
                    Verified
                  </>
                ) : gitEditorStatus === "error" ? (
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
                onClick={() => void handleSaveGit()}
                disabled={!canSaveGit}
              >
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={resetGitEditor}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
