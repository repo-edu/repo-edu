/**
 * OperationTab - Repository operations: Create, Clone, Delete.
 */

import type {
  AppError,
  AssignmentId,
  CloneConfig,
  CreateConfig,
  DeleteConfig,
  DirectoryLayout,
  OperationResult,
  Result,
} from "@repo-edu/backend-interface/types"
import {
  Button,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@repo-edu/ui"
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Loader2,
} from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { commands } from "../../bindings/commands"
import { openDialog } from "../../services/platform"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useOperationStore } from "../../stores/operationStore"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"
import { buildRepoOperationContext } from "../../utils/operationContext"
import { resolveAssignmentGroups } from "../../utils/rosterMetrics"
import { StyledRadioGroup } from "../StyledRadioGroup"

type OperationType = "create" | "clone" | "delete"

/** Width of the label column in the form grid */
const LABEL_WIDTH = 100
/** Extended label width for standalone rows (adds space for "Directory Layout" text) */
const LABEL_WIDTH_EXTENDED = LABEL_WIDTH + 20

export function OperationTab() {
  const roster = useProfileStore((state) => state.document?.roster ?? null)
  const assignments = roster?.assignments ?? []
  const activeProfile = useUiStore((state) => state.activeProfile)
  const setNewProfileDialogOpen = useUiStore(
    (state) => state.setNewProfileDialogOpen,
  )
  const operations = useProfileStore(
    (state) => state.document?.settings.operations,
  )
  const gitConnectionName = useProfileStore(
    (state) => state.document?.settings.git_connection ?? null,
  )
  const gitConnections = useAppSettingsStore((state) => state.gitConnections)
  const updateOperations = useProfileStore((state) => state.updateOperations)

  const operationSelected = useOperationStore((state) => state.selected)
  const setOperationSelected = useOperationStore((state) => state.setSelected)
  const operationStatus = useOperationStore((state) => state.status)
  const setOperationStatus = useOperationStore((state) => state.setStatus)
  const setOperationError = useOperationStore((state) => state.setError)
  const lastResult = useOperationStore((state) => state.lastResult)
  const setLastResult = useOperationStore((state) => state.setLastResult)

  // Use shared assignment selection from profileStore
  const assignmentSelection = useProfileStore(
    (state) => state.assignmentSelection,
  )
  const selectedAssignmentId =
    assignmentSelection?.mode === "assignment" ? assignmentSelection.id : null
  const selectAssignment = useProfileStore((state) => state.selectAssignment)

  // Read form values from store (with defaults)
  const templateOrg = operations?.create.template_org ?? ""
  const targetOrg = operations?.target_org ?? ""
  const targetDir = operations?.clone.target_dir ?? ""
  const directoryLayout = operations?.clone.directory_layout ?? "flat"
  const gitConnection = gitConnectionName
    ? (gitConnections[gitConnectionName] ?? null)
    : null
  const repoContext =
    operations && buildRepoOperationContext(gitConnection, operations)

  // Update handlers that persist to store
  const setTemplateOrg = (value: string) => {
    if (!operations) return
    updateOperations({ create: { ...operations.create, template_org: value } })
  }
  const setTargetOrg = (value: string) =>
    updateOperations({ target_org: value })
  const setTargetDir = (value: string) => {
    if (!operations) return
    updateOperations({ clone: { ...operations.clone, target_dir: value } })
  }
  const setDirectoryLayout = (value: DirectoryLayout) => {
    if (!operations) return
    updateOperations({
      clone: { ...operations.clone, directory_layout: value },
    })
  }

  const selectedAssignment = assignments.find(
    (a) => a.id === selectedAssignmentId,
  )
  const resolvedGroups =
    selectedAssignment && roster
      ? resolveAssignmentGroups(roster, selectedAssignment)
      : []
  const groupCount = resolvedGroups.length
  const allMembers = roster ? [...roster.students, ...roster.staff] : []
  const activeIds = new Set(
    allMembers.filter((m) => m.status === "active").map((m) => m.id),
  )
  const validGroupCount = resolvedGroups.filter((group) =>
    group.member_ids.some((id) => activeIds.has(id)),
  ).length

  const handleBrowseFolder = async () => {
    const result = await openDialog({ directory: true, multiple: false })
    if (result && typeof result === "string") {
      setTargetDir(result)
    }
  }

  const handleExecute = async () => {
    if (!activeProfile || !roster || !selectedAssignmentId || !repoContext) {
      if (!repoContext) {
        setOperationStatus("error")
        setOperationError("No git connection configured for this profile")
      }
      return
    }

    setOperationStatus("running")
    setOperationError(null)
    setLastResult(null)

    try {
      let result: Result<OperationResult, AppError>

      switch (operationSelected) {
        case "create": {
          const config: CreateConfig = { template_org: templateOrg }
          result = await commands.createRepos(
            repoContext,
            roster,
            selectedAssignmentId,
            config,
          )
          break
        }
        case "clone": {
          const config: CloneConfig = {
            target_dir: targetDir,
            directory_layout: directoryLayout,
          }
          result = await commands.cloneReposFromRoster(
            repoContext,
            roster,
            selectedAssignmentId,
            config,
          )
          break
        }
        case "delete": {
          const config: DeleteConfig = {}
          result = await commands.deleteRepos(
            repoContext,
            roster,
            selectedAssignmentId,
            config,
          )
          break
        }
      }

      if (result.status === "error") {
        setOperationStatus("error")
        setOperationError(result.error.message)
        return
      }

      setOperationStatus("success")
      setLastResult(result.data)
    } catch (error) {
      setOperationStatus("error")
      const message = error instanceof Error ? error.message : String(error)
      setOperationError(message)
    }
  }

  if (!activeProfile) {
    return (
      <EmptyState message="No profile selected">
        <Button onClick={() => setNewProfileDialogOpen(true)}>
          Create Profile
        </Button>
      </EmptyState>
    )
  }

  const isExecuteDisabled =
    !selectedAssignmentId ||
    validGroupCount === 0 ||
    operationStatus === "running" ||
    (operationSelected === "clone" && !targetDir) ||
    !repoContext

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Operation Type Tabs */}
      <Tabs
        value={operationSelected}
        onValueChange={(v) => setOperationSelected(v as OperationType)}
      >
        <TabsList className="!pl-0 -ml-2">
          <TabsTrigger value="create" className="justify-start">
            Create Repos
          </TabsTrigger>
          <TabsTrigger value="clone">Clone</TabsTrigger>
          <TabsTrigger value="delete">Delete</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Common Fields */}
      <div
        className="grid items-center gap-x-4 gap-y-2"
        style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}
      >
        <Label
          htmlFor="assignment"
          title="Select the assignment to operate on. The assignment name is used as part of the repository name."
        >
          Assignment
        </Label>
        <Select
          value={selectedAssignmentId ?? ""}
          onValueChange={(v) => selectAssignment(v as AssignmentId)}
        >
          <SelectTrigger
            id="assignment"
            className="w-80"
            title="Select the assignment to operate on. The assignment name is used as part of the repository name."
          >
            <span className="truncate text-left">
              {selectedAssignment
                ? selectedAssignment.name
                : "Select an assignment"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {assignments.map((a) => (
              <SelectItem key={a.id} value={a.id} className="py-1.5">
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Operation-specific fields */}
        {operationSelected === "create" && (
          <>
            <Label
              htmlFor="templateOrg"
              title="The GitHub/GitLab organization containing template repositories. Each assignment's name should match a template repo in this org (e.g., assignment 'lab-1' uses template 'template-org/lab-1')."
            >
              Template Org
            </Label>
            <Input
              id="templateOrg"
              value={templateOrg}
              onChange={(e) => setTemplateOrg(e.target.value)}
              className="w-80"
              placeholder="e.g., tue-5lia0-templates"
              title="The GitHub/GitLab organization containing template repositories. Each assignment's name should match a template repo in this org (e.g., assignment 'lab-1' uses template 'template-org/lab-1')."
            />
          </>
        )}

        <Label
          htmlFor="targetOrg"
          title="The GitHub/GitLab organization where student repositories will be created. Repos are named using the pattern: {assignment}-{group} (e.g., 'lab-1-team-alpha')."
        >
          Target Org
        </Label>
        <Input
          id="targetOrg"
          value={targetOrg}
          onChange={(e) => setTargetOrg(e.target.value)}
          className="w-80"
          placeholder="e.g., tue-5lia0-2024"
          title="The GitHub/GitLab organization where student repositories will be created. Repos are named using the pattern: {assignment}-{group} (e.g., 'lab-1-team-alpha')."
        />

        {operationSelected === "clone" && (
          <>
            <Label
              htmlFor="targetDir"
              title="Local folder where repositories will be cloned."
            >
              Target Folder
            </Label>
            <div className="flex gap-2">
              <Input
                id="targetDir"
                value={targetDir}
                onChange={(e) => setTargetDir(e.target.value)}
                className="w-64"
                placeholder="~/repos/5lia0-2024"
                title="Local folder where repositories will be cloned."
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleBrowseFolder}
                title="Browse for folder"
              >
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Directory Layout - separate from grid for better alignment */}
      {operationSelected === "clone" && (
        <div
          className="flex items-center gap-4"
          title="How cloned repos are organized locally."
        >
          <Label
            className="text-sm font-medium shrink-0"
            style={{ width: LABEL_WIDTH_EXTENDED }}
            title="How cloned repos are organized locally. 'Flat' puts all repos directly in the target folder. 'By Team' groups by team name. 'By Task' groups by assignment."
          >
            Directory Layout
          </Label>
          <StyledRadioGroup
            value={directoryLayout}
            onValueChange={(v) => setDirectoryLayout(v as DirectoryLayout)}
            name="directory-layout"
            options={[
              {
                value: "flat",
                label: "Flat",
                title: "All repos directly in the target folder",
              },
              {
                value: "by-team",
                label: "By Team",
                title: "Repos grouped by team name",
              },
              {
                value: "by-task",
                label: "By Task",
                title: "Repos grouped by assignment",
              },
            ]}
          />
        </div>
      )}

      {/* Summary and Execute Button */}
      <div className="flex items-center justify-between">
        <div>
          {selectedAssignment ? (
            <>
              {validGroupCount} repositories will be{" "}
              {operationSelected === "create"
                ? "created"
                : operationSelected === "clone"
                  ? "cloned"
                  : "deleted"}
              {groupCount !== validGroupCount && (
                <span className="ml-2 text-warning">
                  <AlertCircle className="inline-block size-4 mr-1" />
                  {groupCount - validGroupCount} empty groups will be skipped
                </span>
              )}
            </>
          ) : (
            "Select an assignment to see repository count"
          )}
        </div>
        <Button
          onClick={handleExecute}
          disabled={isExecuteDisabled}
          variant={operationSelected === "delete" ? "destructive" : "outline"}
          className={operationSelected !== "delete" ? "!text-foreground" : ""}
        >
          {operationStatus === "running" ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Running...
            </>
          ) : operationSelected === "create" ? (
            "Create Repos"
          ) : operationSelected === "clone" ? (
            "Clone Repos"
          ) : (
            "Delete Repos"
          )}
        </Button>
      </div>

      {/* Operation error */}
      {operationStatus === "error" && (
        <div className="text-sm text-destructive">
          {useOperationStore.getState().error}
        </div>
      )}

      {/* Inline Result Display */}
      {lastResult && (
        <OperationResultDisplay
          result={lastResult}
          operationType={operationSelected}
        />
      )}
    </div>
  )
}

function OperationResultDisplay({
  result,
  operationType,
}: {
  result: OperationResult
  operationType: OperationType
}) {
  const [errorsExpanded, setErrorsExpanded] = useState(false)
  const [skippedExpanded, setSkippedExpanded] = useState(false)

  const verb =
    operationType === "create"
      ? "created"
      : operationType === "clone"
        ? "cloned"
        : "deleted"

  return (
    <div className="rounded-md border p-3 space-y-2">
      {/* Summary line */}
      <div className="flex items-center gap-4 text-sm">
        {result.succeeded > 0 && (
          <span className="text-success font-medium">
            {result.succeeded} {verb}
          </span>
        )}
        {result.failed > 0 && (
          <span className="text-destructive font-medium">
            {result.failed} failed
          </span>
        )}
        {result.skipped_groups.length > 0 && (
          <span className="text-warning font-medium">
            {result.skipped_groups.length} skipped
          </span>
        )}
        {result.succeeded > 0 &&
          result.failed === 0 &&
          result.skipped_groups.length === 0 && (
            <span className="text-muted-foreground">All succeeded</span>
          )}
      </div>

      {/* Error details (collapsible) */}
      {result.errors.length > 0 && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-destructive hover:opacity-80"
            onClick={() => setErrorsExpanded(!errorsExpanded)}
          >
            {errorsExpanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {result.errors.length} error(s)
          </button>
          {errorsExpanded && (
            <ul className="mt-1 ml-5 space-y-0.5 max-h-48 overflow-y-auto">
              {result.errors.map((err) => (
                <li key={err.repo_name} className="text-sm text-destructive">
                  <span className="font-medium">{err.repo_name}:</span>{" "}
                  {err.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Skipped details (collapsible) */}
      {result.skipped_groups.length > 0 && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-warning hover:opacity-80"
            onClick={() => setSkippedExpanded(!skippedExpanded)}
          >
            {skippedExpanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {result.skipped_groups.length} skipped group(s)
          </button>
          {skippedExpanded && (
            <ul className="mt-1 ml-5 space-y-0.5 max-h-48 overflow-y-auto">
              {result.skipped_groups.map((skip) => (
                <li
                  key={skip.group_id}
                  className="text-sm text-muted-foreground"
                >
                  <span className="font-medium">{skip.group_name}:</span>{" "}
                  {formatSkipReason(skip.reason)}
                  {skip.context && ` (${skip.context})`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function formatSkipReason(reason: string): string {
  switch (reason) {
    case "empty_group":
      return "empty group"
    case "all_members_skipped":
      return "all members skipped"
    case "repo_exists":
      return "repository already exists"
    case "repo_not_found":
      return "repository not found"
    default:
      return reason
  }
}
