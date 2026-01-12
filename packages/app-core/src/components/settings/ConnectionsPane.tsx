/**
 * ConnectionsPane - Content for managing LMS and Git connections.
 * Used within the SettingsDialog.
 */

import type {
  GitConnection,
  GitIdentityMode,
  GitServerType,
  LmsConnection,
  LmsType,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { commands } from "../../bindings/commands"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useConnectionsStore } from "../../stores/connectionsStore"
import { useOutputStore } from "../../stores/outputStore"
import { buildLmsOperationContext } from "../../utils/operationContext"

type ConnectionStatus = "disconnected" | "verifying" | "connected" | "error"

interface LmsFormState {
  lms_type: LmsType
  base_url: string
  access_token: string
  user_agent: string
}

interface GitFormState {
  name: string
  server_type: GitServerType
  base_url: string
  user: string
  access_token: string
  identity_mode: GitIdentityMode
}

const LMS_TYPES: { value: LmsType; label: string }[] = [
  { value: "canvas", label: "Canvas LMS" },
  { value: "moodle", label: "Moodle" },
]

const GIT_SERVER_TYPES: { value: GitServerType; label: string }[] = [
  { value: "GitHub", label: "GitHub" },
  { value: "GitLab", label: "GitLab" },
  { value: "Gitea", label: "Gitea" },
]

const IDENTITY_MODES: { value: GitIdentityMode; label: string }[] = [
  { value: "email", label: "Email-based matching" },
  { value: "username", label: "Username matching" },
]

export function ConnectionsPane() {
  const appendOutput = useOutputStore((state) => state.appendText)

  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const gitConnections = useAppSettingsStore((state) => state.gitConnections)
  const setLmsConnection = useAppSettingsStore(
    (state) => state.setLmsConnection,
  )
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

  const lmsStatus = useConnectionsStore((state) => state.lmsStatus)
  const gitStatuses = useConnectionsStore((state) => state.gitStatuses)
  const lmsError = useConnectionsStore((state) => state.lmsError)
  const gitErrors = useConnectionsStore((state) => state.gitErrors)
  const setLmsStatus = useConnectionsStore((state) => state.setLmsStatus)
  const setGitStatus = useConnectionsStore((state) => state.setGitStatus)

  // UI state
  const [editingLms, setEditingLms] = useState(false)
  const [addingGit, setAddingGit] = useState(false)
  const [editingGit, setEditingGit] = useState<string | null>(null)

  // Form states
  const [lmsForm, setLmsForm] = useState<LmsFormState>({
    lms_type: "canvas",
    base_url: "",
    access_token: "",
    user_agent: "",
  })
  const [gitForm, setGitForm] = useState<GitFormState>({
    name: "",
    server_type: "GitHub",
    base_url: "",
    user: "",
    access_token: "",
    identity_mode: "email",
  })

  // Token visibility
  const [showLmsToken, setShowLmsToken] = useState(false)
  const [showGitToken, setShowGitToken] = useState(false)

  // Verification state for drafts
  const [draftLmsStatus, setDraftLmsStatus] =
    useState<ConnectionStatus>("disconnected")
  const [draftGitStatus, setDraftGitStatus] =
    useState<ConnectionStatus>("disconnected")
  const [draftLmsError, setDraftLmsError] = useState<string | null>(null)
  const [draftGitError, setDraftGitError] = useState<string | null>(null)

  const handleEditLms = () => {
    if (lmsConnection) {
      setLmsForm({
        lms_type: lmsConnection.lms_type,
        base_url: lmsConnection.base_url,
        access_token: lmsConnection.access_token,
        user_agent: lmsConnection.user_agent ?? "",
      })
    }
    setEditingLms(true)
    setDraftLmsStatus("disconnected")
  }

  const handleVerifyLmsSaved = async () => {
    if (!lmsConnection) return
    const context = buildLmsOperationContext(lmsConnection, "") ?? {
      connection: lmsConnection,
      course_id: "",
    }

    setLmsStatus("verifying", null)
    try {
      const result = await commands.verifyLmsConnectionDraft(context)
      if (result.status === "error") {
        setLmsStatus("error", result.error.message)
        appendOutput(
          `LMS verification failed: ${result.error.message}`,
          "error",
        )
      } else if (result.data.success) {
        setLmsStatus("connected", null)
        appendOutput("LMS connection verified", "success")
      } else {
        setLmsStatus("error", result.data.message)
        appendOutput(`LMS verification failed: ${result.data.message}`, "error")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setLmsStatus("error", message)
      appendOutput(`LMS verification failed: ${message}`, "error")
    }
  }

  const handleVerifyLms = async () => {
    setDraftLmsStatus("verifying")
    setDraftLmsError(null)
    try {
      const connection: LmsConnection = {
        lms_type: lmsForm.lms_type,
        base_url: lmsForm.base_url,
        access_token: lmsForm.access_token,
        user_agent: lmsForm.user_agent || undefined,
      }
      const context = buildLmsOperationContext(connection, "") ?? {
        connection,
        course_id: "",
      }
      const result = await commands.verifyLmsConnectionDraft(context)
      if (result.status === "error") {
        setDraftLmsStatus("error")
        setDraftLmsError(result.error.message)
      } else if (result.data.success) {
        setDraftLmsStatus("connected")
      } else {
        setDraftLmsStatus("error")
        setDraftLmsError(result.data.message)
      }
    } catch (error) {
      setDraftLmsStatus("error")
      setDraftLmsError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleSaveLms = async () => {
    const connection: LmsConnection = {
      lms_type: lmsForm.lms_type,
      base_url: lmsForm.base_url,
      access_token: lmsForm.access_token,
      user_agent: lmsForm.user_agent || undefined,
    }
    setLmsConnection(connection)
    await saveAppSettings()

    const { status, error } = useAppSettingsStore.getState()
    if (status === "error") {
      appendOutput(`Failed to save LMS connection: ${error}`, "error")
      return
    }

    setEditingLms(false)
    setLmsStatus(draftLmsStatus, draftLmsError)
    appendOutput("LMS connection saved", "success")
  }

  const handleRemoveLms = async () => {
    setLmsConnection(null)
    await saveAppSettings()
    setLmsStatus("disconnected", null)
  }

  const handleAddGit = () => {
    setGitForm({
      name: "",
      server_type: "GitHub",
      base_url: "",
      user: "",
      access_token: "",
      identity_mode: "email",
    })
    setAddingGit(true)
    setEditingGit(null)
    setDraftGitStatus("disconnected")
  }

  const handleEditGit = (name: string) => {
    const conn = gitConnections[name]
    if (conn) {
      setGitForm({
        name,
        server_type: conn.server_type,
        base_url: conn.connection.base_url ?? "",
        user: conn.connection.user,
        access_token: conn.connection.access_token,
        identity_mode: conn.identity_mode ?? "email",
      })
      setEditingGit(name)
      setAddingGit(false)
      setDraftGitStatus("disconnected")
    }
  }

  const handleVerifyGitSaved = async (name: string) => {
    const conn = gitConnections[name]
    if (!conn) return

    setGitStatus(name, "verifying", null)
    try {
      const result = await commands.verifyGitConnectionDraft(conn)
      if (result.status === "error") {
        setGitStatus(name, "error", result.error.message)
        appendOutput(
          `Git connection "${name}" verification failed: ${result.error.message}`,
          "error",
        )
      } else if (result.data.success) {
        setGitStatus(name, "connected", null)
        appendOutput(
          `Git connection "${name}" verified as ${result.data.username}`,
          "success",
        )
      } else {
        setGitStatus(name, "error", result.data.message)
        appendOutput(
          `Git connection "${name}" verification failed: ${result.data.message}`,
          "error",
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setGitStatus(name, "error", message)
      appendOutput(
        `Git connection "${name}" verification failed: ${message}`,
        "error",
      )
    }
  }

  const handleVerifyGit = async () => {
    setDraftGitStatus("verifying")
    setDraftGitError(null)
    try {
      const connection: GitConnection = {
        server_type: gitForm.server_type,
        connection: {
          access_token: gitForm.access_token,
          base_url: gitForm.base_url || null,
          user: gitForm.user,
        },
        identity_mode: gitForm.identity_mode,
      }
      const result = await commands.verifyGitConnectionDraft(connection)
      if (result.status === "error") {
        setDraftGitStatus("error")
        setDraftGitError(result.error.message)
      } else if (result.data.success) {
        setDraftGitStatus("connected")
      } else {
        setDraftGitStatus("error")
        setDraftGitError(result.data.message)
      }
    } catch (error) {
      setDraftGitStatus("error")
      setDraftGitError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleSaveGit = async () => {
    const connection: GitConnection = {
      server_type: gitForm.server_type,
      connection: {
        access_token: gitForm.access_token,
        base_url: gitForm.base_url || null,
        user: gitForm.user,
      },
      identity_mode: gitForm.identity_mode,
    }
    const savedName = gitForm.name
    if (addingGit) {
      addGitConnection(gitForm.name, connection)
    } else if (editingGit) {
      if (editingGit !== gitForm.name) {
        removeGitConnection(editingGit)
        addGitConnection(gitForm.name, connection)
      } else {
        updateGitConnection(gitForm.name, connection)
      }
    }
    await saveAppSettings()
    setAddingGit(false)
    setEditingGit(null)
    setGitStatus(savedName, draftGitStatus, draftGitError)
  }

  const handleRemoveGit = async (name: string) => {
    removeGitConnection(name)
    await saveAppSettings()
    if (editingGit === name) {
      setEditingGit(null)
    }
  }

  const handleCancelLms = () => {
    setEditingLms(false)
    setDraftLmsStatus("disconnected")
  }

  const handleCancelGit = () => {
    setAddingGit(false)
    setEditingGit(null)
    setDraftGitStatus("disconnected")
  }

  const isLmsFormValid = lmsForm.base_url.trim() && lmsForm.access_token.trim()
  const isGitFormValid =
    gitForm.name.trim() && gitForm.user.trim() && gitForm.access_token.trim()

  return (
    <div className="space-y-6">
      {/* LMS Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">LMS Connection</h3>
          {!lmsConnection && !editingLms && (
            <Button size="sm" variant="outline" onClick={handleEditLms}>
              <Plus className="size-4 mr-1" />
              Add
            </Button>
          )}
        </div>

        {editingLms ? (
          <LmsForm
            form={lmsForm}
            setForm={setLmsForm}
            showToken={showLmsToken}
            setShowToken={setShowLmsToken}
            status={draftLmsStatus}
            error={draftLmsError}
            isValid={!!isLmsFormValid}
            onVerify={handleVerifyLms}
            onSave={handleSaveLms}
            onCancel={handleCancelLms}
          />
        ) : lmsConnection ? (
          <ConnectionCard
            title={
              LMS_TYPES.find((t) => t.value === lmsConnection.lms_type)
                ?.label ?? lmsConnection.lms_type
            }
            subtitle={lmsConnection.base_url}
            status={lmsStatus}
            error={lmsError}
            onVerify={handleVerifyLmsSaved}
            onEdit={handleEditLms}
            onRemove={handleRemoveLms}
          />
        ) : (
          <p className="text-muted-foreground">No LMS connection configured.</p>
        )}
      </section>

      {/* Git Connections Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Git Connections</h3>
          {!addingGit && !editingGit && (
            <Button size="sm" variant="outline" onClick={handleAddGit}>
              <Plus className="size-4 mr-1" />
              Add
            </Button>
          )}
        </div>

        {(addingGit || editingGit) && (
          <GitForm
            form={gitForm}
            setForm={setGitForm}
            showToken={showGitToken}
            setShowToken={setShowGitToken}
            status={draftGitStatus}
            error={draftGitError}
            isValid={!!isGitFormValid}
            isNew={addingGit}
            existingNames={Object.keys(gitConnections).filter(
              (n) => n !== editingGit,
            )}
            onVerify={handleVerifyGit}
            onSave={handleSaveGit}
            onCancel={handleCancelGit}
          />
        )}

        {Object.keys(gitConnections).length === 0 &&
        !addingGit &&
        !editingGit ? (
          <p className="text-muted-foreground">
            No git connections configured.
          </p>
        ) : (
          <div className="space-y-2">
            {Object.entries(gitConnections).map(([name, conn]) => (
              <ConnectionCard
                key={name}
                title={name}
                subtitle={`${conn.server_type} • ${conn.connection.user}`}
                status={gitStatuses[name] ?? "disconnected"}
                error={gitErrors[name] ?? null}
                onVerify={() => handleVerifyGitSaved(name)}
                onEdit={() => handleEditGit(name)}
                onRemove={() => handleRemoveGit(name)}
                disabled={editingGit === name}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

interface ConnectionCardProps {
  title: string
  subtitle: string
  status: ConnectionStatus
  error: string | null
  onVerify: () => void
  onEdit: () => void
  onRemove: () => void
  disabled?: boolean
}

function ConnectionCard({
  title,
  subtitle,
  status,
  error,
  onVerify,
  onEdit,
  onRemove,
  disabled,
}: ConnectionCardProps) {
  const isVerifying = status === "verifying"

  return (
    <div className={`border rounded-md p-3 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{title}</span>
            <StatusIndicator status={status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {subtitle}
          </p>
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onVerify}
            disabled={disabled || isVerifying}
            title={
              status === "connected"
                ? "Re-verify connection"
                : "Verify connection"
            }
          >
            {isVerifying ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={onEdit}
            disabled={disabled}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={onRemove}
            disabled={disabled}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function StatusIndicator({ status }: { status: ConnectionStatus }) {
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

interface LmsFormProps {
  form: LmsFormState
  setForm: (form: LmsFormState) => void
  showToken: boolean
  setShowToken: (show: boolean) => void
  status: ConnectionStatus
  error: string | null
  isValid: boolean
  onVerify: () => void
  onSave: () => void
  onCancel: () => void
}

function LmsForm({
  form,
  setForm,
  showToken,
  setShowToken,
  status,
  error,
  isValid,
  onVerify,
  onSave,
  onCancel,
}: LmsFormProps) {
  return (
    <div className="border rounded-md p-4 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="lms-type">LMS Type</Label>
        <Select
          value={form.lms_type}
          onValueChange={(v) => setForm({ ...form, lms_type: v as LmsType })}
        >
          <SelectTrigger id="lms-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LMS_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="lms-url">Base URL</Label>
        <Input
          id="lms-url"
          value={form.base_url}
          onChange={(e) => setForm({ ...form, base_url: e.target.value })}
          placeholder="https://canvas.example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="lms-token">Access Token</Label>
        <div className="relative">
          <Input
            id="lms-token"
            type={showToken ? "text" : "password"}
            value={form.access_token}
            onChange={(e) => setForm({ ...form, access_token: e.target.value })}
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3"
            onClick={() => setShowToken(!showToken)}
          >
            {showToken ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="lms-user-agent">User-Agent (optional)</Label>
        <Input
          id="lms-user-agent"
          value={form.user_agent}
          onChange={(e) => setForm({ ...form, user_agent: e.target.value })}
          placeholder="Your Name / Organization / email@university.edu"
        />
        <p className="text-xs text-muted-foreground">
          Identifies you to LMS administrators. Recommended format: Name /
          Organization / email
        </p>
      </div>

      {error && <p className="text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onVerify}
          disabled={!isValid || status === "verifying"}
        >
          {status === "verifying" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : status === "connected" ? (
            <>
              <Check className="size-4 mr-1" />
              Verified
            </>
          ) : (
            "Verify"
          )}
        </Button>
        <Button size="sm" onClick={onSave} disabled={!isValid}>
          Save
        </Button>
      </div>
    </div>
  )
}

interface GitFormProps {
  form: GitFormState
  setForm: (form: GitFormState) => void
  showToken: boolean
  setShowToken: (show: boolean) => void
  status: ConnectionStatus
  error: string | null
  isValid: boolean
  isNew: boolean
  existingNames: string[]
  onVerify: () => void
  onSave: () => void
  onCancel: () => void
}

function GitForm({
  form,
  setForm,
  showToken,
  setShowToken,
  status,
  error,
  isValid,
  isNew,
  existingNames,
  onVerify,
  onSave,
  onCancel,
}: GitFormProps) {
  const nameConflict = isNew && existingNames.includes(form.name.trim())

  return (
    <div className="border rounded-md p-4 space-y-4 mb-3">
      <div className="space-y-2">
        <Label htmlFor="git-name">Connection Name</Label>
        <Input
          id="git-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g., GitHub Personal"
        />
        {nameConflict && (
          <p className="text-xs text-destructive">
            A connection with this name already exists.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="git-type">Server Type</Label>
        <Select
          value={form.server_type}
          onValueChange={(v) =>
            setForm({ ...form, server_type: v as GitServerType })
          }
        >
          <SelectTrigger id="git-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GIT_SERVER_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {form.server_type !== "GitHub" && (
        <div className="space-y-2">
          <Label htmlFor="git-url">Base URL</Label>
          <Input
            id="git-url"
            value={form.base_url}
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            placeholder="https://gitlab.example.com"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="git-user">Username / Org</Label>
        <Input
          id="git-user"
          value={form.user}
          onChange={(e) => setForm({ ...form, user: e.target.value })}
          placeholder="e.g., my-org"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="git-token">Access Token</Label>
        <div className="relative">
          <Input
            id="git-token"
            type={showToken ? "text" : "password"}
            value={form.access_token}
            onChange={(e) => setForm({ ...form, access_token: e.target.value })}
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3"
            onClick={() => setShowToken(!showToken)}
          >
            {showToken ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="git-identity">Identity Mode</Label>
        <Select
          value={form.identity_mode}
          onValueChange={(v) =>
            setForm({ ...form, identity_mode: v as GitIdentityMode })
          }
        >
          <SelectTrigger id="git-identity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IDENTITY_MODES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onVerify}
          disabled={!isValid || status === "verifying" || nameConflict}
        >
          {status === "verifying" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : status === "connected" ? (
            <>
              <Check className="size-4 mr-1" />
              Verified
            </>
          ) : (
            "Verify"
          )}
        </Button>
        <Button size="sm" onClick={onSave} disabled={!isValid || nameConflict}>
          Save
        </Button>
      </div>
    </div>
  )
}
