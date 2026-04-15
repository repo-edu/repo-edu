import type { RepositoryListNamespaceResult } from "@repo-edu/application-contract"
import {
  gitConnectionDisplayLabel,
  gitNamespaceTerminology,
  normalizeGitNamespaceInput,
} from "@repo-edu/domain/settings"
import type { GitProviderKind } from "@repo-edu/domain/types"
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import { ChevronDown, Loader2 } from "@repo-edu/ui/components/icons"
import { useEffect, useState } from "react"
import { useRendererHost } from "../../../../contexts/renderer-host.js"
import { getWorkflowClient } from "../../../../contexts/workflow-client.js"
import { useAppSettingsStore } from "../../../../stores/app-settings-store.js"
import { useUiStore } from "../../../../stores/ui-store.js"
import { getErrorMessage } from "../../../../utils/error-message.js"
import type {
  CloneDirectoryLayout,
  OperationModeKey,
  RepositoryOperationMode,
} from "../../../../utils/repository-workflow.js"
import {
  type OperationResult,
  useRepoOperations,
} from "./use-repo-operations.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseRepoOps = ReturnType<typeof useRepoOperations>

type OperationControlsProps = {
  groupSetId: string
  disabled: boolean
  effectiveAssignmentId: string | null
  nonEmptyCount: number
  emptyCount: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<OperationModeKey, string> = {
  create: "Create Repos",
  update: "Update Repos",
  clone: "Clone Repos",
  "clone-all": "Clone All",
}

function modeTooltip(
  mode: OperationModeKey,
  provider: GitProviderKind | null | undefined,
): string {
  if (mode === "clone-all") {
    const container = provider === "gitlab" ? "GitLab Group" : "Organization"
    return `List and clone all repositories in the ${container}`
  }
  return MODE_TOOLTIPS_STATIC[mode]
}

const MODE_TOOLTIPS_STATIC: Record<
  Exclude<OperationModeKey, "clone-all">,
  string
> = {
  create: "Create one repository per group from the assignment template",
  update: "Open pull requests with the latest template changes",
  clone: "Clone assignment repositories to a local folder",
}

const MODE_ORDER: readonly OperationModeKey[] = [
  "create",
  "update",
  "clone",
  "clone-all",
] as const

const selectedOutlineButtonClass =
  "!bg-selection ![background-image:none] !text-foreground"

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function OperationControls({
  groupSetId,
  disabled,
  effectiveAssignmentId,
  nonEmptyCount,
  emptyCount,
}: OperationControlsProps) {
  const ops = useRepoOperations({
    effectiveAssignmentId,
    nonEmptyCount,
    emptyCount,
    disabled,
  })
  const openSection = useUiStore(
    (s) => s.groupOperationSectionByGroupSet[groupSetId] ?? null,
  )
  const setGroupOperationSection = useUiStore((s) => s.setGroupOperationSection)

  const toggleSection = (section: OperationModeKey) => {
    setGroupOperationSection(
      groupSetId,
      openSection === section ? null : section,
    )
  }

  return (
    <div className="px-3 py-2 space-y-2 border-b">
      <div className="flex items-center gap-2">
        {MODE_ORDER.map((section) => (
          <ModeButton
            key={section}
            label={MODE_LABELS[section]}
            tooltip={modeTooltip(section, ops.activeGitConnection?.provider)}
            active={openSection === section}
            disabled={disabled}
            onClick={() => toggleSection(section)}
          />
        ))}
      </div>

      {openSection !== null && (
        <OperationPanel
          operation={openSection}
          groupSetId={groupSetId}
          ops={ops}
          nonEmptyCount={nonEmptyCount}
          emptyCount={emptyCount}
        />
      )}

      {ops.operationError && (
        <p className="text-sm text-destructive">{ops.operationError}</p>
      )}
      {ops.lastResult && (
        <p className="text-sm text-muted-foreground">
          {formatOperationResult(ops.lastResult)}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mode tab bar
// ---------------------------------------------------------------------------

function ModeButton({
  label,
  tooltip,
  active,
  disabled,
  onClick,
}: {
  label: string
  tooltip: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={active ? selectedOutlineButtonClass : ""}
          disabled={disabled}
          onClick={onClick}
        >
          {label}
          <ChevronDown
            className={`ml-1 size-4 transition-transform ${
              active ? "rotate-180" : ""
            }`}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// Operation panel: shared fields + operation-specific fields + run row
// ---------------------------------------------------------------------------

function OperationPanel({
  operation,
  groupSetId,
  ops,
  nonEmptyCount,
  emptyCount,
}: {
  operation: OperationModeKey
  groupSetId: string
  ops: UseRepoOps
  nonEmptyCount: number
  emptyCount: number
}) {
  if (operation === "clone-all") {
    return (
      <div className="border rounded-md p-3 space-y-3">
        <SharedFields groupSetId={groupSetId} ops={ops} />
        <CloneAllFields ops={ops} />
      </div>
    )
  }
  return (
    <div className="border rounded-md p-3 space-y-3">
      <SharedFields groupSetId={groupSetId} ops={ops} />
      {operation === "create" && <CreateFields ops={ops} />}
      {operation === "update" && <UpdateFields />}
      {operation === "clone" && <CloneFields ops={ops} />}
      <RunRow
        operation={operation}
        ops={ops}
        nonEmptyCount={nonEmptyCount}
        emptyCount={emptyCount}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared fields: organization + git connection
// ---------------------------------------------------------------------------

function SharedFields({
  groupSetId,
  ops,
}: {
  groupSetId: string
  ops: UseRepoOps
}) {
  const raw = ops.organization ?? ""
  const baseUrl = (ops.activeGitConnection?.baseUrl ?? "").replace(/\/+$/, "")
  const inputRevealsConnection =
    ops.gitConnections.length === 1 &&
    baseUrl.length > 0 &&
    raw.includes(baseUrl)

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
      <NamespaceField groupSetId={groupSetId} ops={ops} />
      {!inputRevealsConnection && (
        <GitConnectionField groupSetId={groupSetId} ops={ops} />
      )}
    </div>
  )
}

function NamespaceField({
  groupSetId,
  ops,
}: {
  groupSetId: string
  ops: UseRepoOps
}) {
  const id = `group-set-${groupSetId}-namespace`
  const connection = ops.activeGitConnection
  const { label, sampleSlug } = gitNamespaceTerminology(connection?.provider)
  const baseUrl = (connection?.baseUrl ?? "").replace(/\/+$/, "")
  const placeholder = baseUrl
    ? `${sampleSlug} or ${baseUrl}/${sampleSlug}`
    : sampleSlug
  const raw = ops.organization ?? ""
  const normalized = normalizeGitNamespaceInput(raw)
  const showPreview = raw.length > 0 && raw !== normalized

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={raw}
        onChange={(event) => ops.setOrganization(event.target.value || null)}
        placeholder={placeholder}
      />
      {showPreview && (
        <p className="text-xs text-muted-foreground">
          → {normalized === "" ? "(no namespace found)" : normalized}
        </p>
      )}
    </div>
  )
}

function GitConnectionField({
  groupSetId,
  ops,
}: {
  groupSetId: string
  ops: UseRepoOps
}) {
  const id = `git-connection-${groupSetId}`
  if (ops.gitConnections.length === 0) {
    return (
      <div className="space-y-1">
        <Label>Git connection</Label>
        <p className="text-sm text-destructive">
          Add a Git connection in Settings before running repository operations.
        </p>
      </div>
    )
  }
  if (ops.gitConnections.length === 1) {
    const conn = ops.gitConnections[0]
    const host = conn.baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
    return (
      <div className="space-y-1">
        <Label>Git connection</Label>
        <p className="text-sm text-muted-foreground">{host}</p>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Git connection</Label>
      <Select
        value={ops.activeGitConnection?.id ?? ""}
        onValueChange={(value) => {
          void ops.handleSelectActiveGitConnection(value || null)
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ops.gitConnections.map((connection) => (
            <SelectItem key={connection.id} value={connection.id}>
              {gitConnectionDisplayLabel(connection)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {ops.activeGitConnectionId === null && ops.activeGitConnection && (
        <p className="text-xs text-muted-foreground">
          Using {gitConnectionDisplayLabel(ops.activeGitConnection)} by default.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create-operation fields: template source
// ---------------------------------------------------------------------------

function CreateFields({ ops }: { ops: UseRepoOps }) {
  const rendererHost = useRendererHost()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label>Template Source</Label>
        <Button
          variant="outline"
          className={
            ops.templateKind === "remote" ? selectedOutlineButtonClass : ""
          }
          size="sm"
          type="button"
          onClick={() => ops.setTemplateKind("remote")}
        >
          Remote
        </Button>
        <Button
          variant="outline"
          className={
            ops.templateKind === "local" ? selectedOutlineButtonClass : ""
          }
          size="sm"
          type="button"
          onClick={() => ops.setTemplateKind("local")}
        >
          Local
        </Button>
      </div>
      <div className="space-y-1">
        {ops.templateKind === "remote" ? (
          <>
            <Label htmlFor="group-set-create-template-owner">
              Template Org
            </Label>
            <Input
              id="group-set-create-template-owner"
              value={ops.templateOwner}
              onChange={(event) => ops.setTemplateOwner(event.target.value)}
              placeholder="e.g., template-org"
            />
          </>
        ) : (
          <>
            <Label htmlFor="group-set-create-template-path">
              Template Path
            </Label>
            <div className="flex gap-1">
              <Input
                id="group-set-create-template-path"
                value={ops.templateLocalPath}
                onChange={(event) =>
                  ops.setTemplateLocalPath(event.target.value)
                }
                placeholder="e.g., /path/to/template"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const dir = await rendererHost.pickDirectory({
                    title: "Select template repository",
                  })
                  if (dir) ops.setTemplateLocalPath(dir)
                }}
              >
                Browse
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Update-operation fields: description only
// ---------------------------------------------------------------------------

function UpdateFields() {
  return (
    <p className="text-sm text-muted-foreground">
      Creates pull requests from template changes for the selected assignment's
      repositories. Uses assignment template SHA tracking to open update PRs.
    </p>
  )
}

// ---------------------------------------------------------------------------
// Clone-operation fields: target folder + layout
// ---------------------------------------------------------------------------

function CloneFields({ ops }: { ops: UseRepoOps }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="space-y-1 md:flex-1">
        <Label htmlFor="group-set-clone-target-folder">Target Folder</Label>
        <Input
          id="group-set-clone-target-folder"
          value={ops.cloneTargetDirectory}
          onChange={(event) =>
            ops.setRepositoryCloneTargetDirectory(event.target.value || null)
          }
          placeholder="e.g., /Users/me/repos/course or ~/repos/course"
        />
        <p className="text-xs text-muted-foreground">
          Use an absolute path or a path starting with ~.
        </p>
      </div>
      <div className="space-y-1 md:ml-auto md:shrink-0">
        <Label htmlFor="group-set-clone-layout">Directory Layout</Label>
        <Select
          value={ops.cloneDirectoryLayout}
          onValueChange={(value) =>
            ops.setRepositoryCloneDirectoryLayout(value as CloneDirectoryLayout)
          }
        >
          <SelectTrigger
            id="group-set-clone-layout"
            className="w-full md:w-[16ch]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="w-[16ch] min-w-[16ch]">
            <SelectItem value="flat">Flat</SelectItem>
            <SelectItem value="by-team">By Team</SelectItem>
            <SelectItem value="by-task">By Assignment</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Run row: action button + count text
// ---------------------------------------------------------------------------

function RunRow({
  operation,
  ops,
  nonEmptyCount,
  emptyCount,
}: {
  operation: RepositoryOperationMode
  ops: UseRepoOps
  nonEmptyCount: number
  emptyCount: number
}) {
  const { canRun, blockers } = ops.readiness[operation]
  const isRunning = ops.runningOperation === operation

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          size="sm"
          variant="commit"
          onClick={() => void ops.handleRunOperation(operation)}
          disabled={!canRun}
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Running...
            </>
          ) : (
            MODE_LABELS[operation]
          )}
        </Button>
        {canRun && operation === "create" && (
          <div className="text-sm text-muted-foreground">
            Will {operation} {nonEmptyCount} repositor
            {nonEmptyCount === 1 ? "y" : "ies"}.
            {emptyCount > 0 && (
              <span className="ml-1">
                {emptyCount} empty group{emptyCount === 1 ? "" : "s"} will be
                skipped.
              </span>
            )}
          </div>
        )}
      </div>
      {blockers.length > 0 && (
        <ul className="text-sm text-muted-foreground space-y-0.5">
          {blockers.map((blocker) => (
            <li key={blocker}>• {blocker}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Clone All Repos fields (namespace-scoped bulk clone)
// ---------------------------------------------------------------------------

// Debounce window between the user's last filter/archived edit and the
// `repo.listNamespace` call that reflects it. Short enough that the preview
// feels live, long enough that rapid typing batches into a single request.
const CLONE_ALL_LIST_DEBOUNCE_MS = 350

function CloneAllFields({ ops }: { ops: UseRepoOps }) {
  const rendererHost = useRendererHost()
  const appSettings = useAppSettingsStore((s) => s.settings)
  const [filter, setFilter] = useState("")
  const [includeArchived, setIncludeArchived] = useState(false)
  const [targetDirectory, setTargetDirectory] = useState<string>(
    ops.cloneTargetDirectory,
  )
  const [listResult, setListResult] =
    useState<RepositoryListNamespaceResult | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [resultSummary, setResultSummary] = useState<string | null>(null)
  const [isListing, setIsListing] = useState(false)
  const [isCloning, setIsCloning] = useState(false)

  const namespace =
    ops.organization !== null
      ? normalizeGitNamespaceInput(ops.organization)
      : ""
  const hasConnection = ops.activeGitConnection !== null
  const hasNamespace = namespace.length > 0
  const hasTargetDirectory = targetDirectory.trim().length > 0
  const canClone =
    hasConnection &&
    hasNamespace &&
    hasTargetDirectory &&
    !isCloning &&
    !isListing &&
    listError === null &&
    listResult !== null &&
    listResult.repositories.length > 0

  // Auto-list whenever an input that feeds the listing query changes. A
  // short debounce batches rapid typing into a single provider request and
  // the AbortController cancels the in-flight fetch when the inputs change
  // again mid-request, so the preview always reflects the latest edit.
  useEffect(() => {
    if (!hasConnection || !hasNamespace) {
      setListResult(null)
      setListError(null)
      setIsListing(false)
      return
    }

    const ac = new AbortController()
    const timer = setTimeout(() => {
      if (ac.signal.aborted) return
      setIsListing(true)
      setListError(null)
      setResultSummary(null)

      void (async () => {
        try {
          const client = getWorkflowClient()
          const result = await client.run(
            "repo.listNamespace",
            {
              appSettings,
              namespace,
              filter: filter.trim() || undefined,
              includeArchived,
            },
            { signal: ac.signal },
          )
          if (ac.signal.aborted) return
          setListResult(result)
        } catch (err) {
          if (ac.signal.aborted) return
          if (err instanceof DOMException && err.name === "AbortError") return
          setListError(getErrorMessage(err))
        } finally {
          if (!ac.signal.aborted) setIsListing(false)
        }
      })()
    }, CLONE_ALL_LIST_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [
    filter,
    includeArchived,
    namespace,
    hasConnection,
    hasNamespace,
    appSettings,
  ])

  const handleBulkClone = async () => {
    if (!canClone || listResult === null) return
    setIsCloning(true)
    setCloneError(null)
    setResultSummary(null)
    try {
      const client = getWorkflowClient()
      const result = await client.run("repo.bulkClone", {
        appSettings,
        namespace,
        repositories: listResult.repositories.map(({ name, identifier }) => ({
          name,
          identifier,
        })),
        targetDirectory: targetDirectory.trim(),
      })
      const time = new Date(result.completedAt).toLocaleTimeString()
      setResultSummary(
        `${result.repositoriesCloned} cloned / ${result.repositoriesFailed} failed at ${time}.`,
      )
    } catch (err) {
      setCloneError(getErrorMessage(err))
    } finally {
      setIsCloning(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="clone-all-filter">Name filter</Label>
        <Input
          id="clone-all-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Example: 1*"
        />
        <p className="text-xs text-muted-foreground">
          Filter syntax: * = any characters, ? = one character. Leave blank to
          list all.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="clone-all-include-archived"
          checked={includeArchived}
          onCheckedChange={(next) => setIncludeArchived(next === true)}
        />
        <Label htmlFor="clone-all-include-archived">Include archived</Label>
      </div>
      <div className="space-y-1">
        <Label htmlFor="clone-all-target">Target folder</Label>
        <div className="flex gap-1">
          <Input
            id="clone-all-target"
            value={targetDirectory}
            onChange={(event) => setTargetDirectory(event.target.value)}
            placeholder="e.g., /Users/me/repos/discovered or ~/repos/discovered"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const directory = await rendererHost.pickDirectory({
                title: "Select clone target folder",
              })
              if (directory) setTargetDirectory(directory)
            }}
          >
            Browse
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Use an absolute path or a path starting with ~.
        </p>
      </div>

      <CloneAllPreview
        listResult={listResult}
        listError={listError}
        isListing={isListing}
        isCloning={isCloning}
        hasConnection={hasConnection}
        hasNamespace={hasNamespace}
        onClone={() => void handleBulkClone()}
        canClone={canClone}
      />

      {cloneError && <p className="text-sm text-destructive">{cloneError}</p>}
      {resultSummary && (
        <p className="text-sm text-muted-foreground">{resultSummary}</p>
      )}
    </div>
  )
}

function CloneAllPreview({
  listResult,
  listError,
  isListing,
  isCloning,
  hasConnection,
  hasNamespace,
  onClone,
  canClone,
}: {
  listResult: RepositoryListNamespaceResult | null
  listError: string | null
  isListing: boolean
  isCloning: boolean
  hasConnection: boolean
  hasNamespace: boolean
  onClone: () => void
  canClone: boolean
}) {
  if (!hasConnection) {
    return (
      <p className="text-sm text-muted-foreground">
        Configure a Git connection to list repositories.
      </p>
    )
  }
  if (!hasNamespace) {
    return (
      <p className="text-sm text-muted-foreground">
        Enter a namespace to list repositories.
      </p>
    )
  }
  if (listError !== null) {
    return <p className="text-sm text-destructive">{listError}</p>
  }
  if (listResult === null) {
    return (
      <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" />
        Listing repositories…
      </p>
    )
  }
  const entries = listResult.repositories
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No repositories match that filter.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium inline-flex items-center gap-2">
        {entries.length} repositor{entries.length === 1 ? "y" : "ies"} match.
        {isListing && (
          <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            refreshing…
          </span>
        )}
      </p>
      <div className="border rounded max-h-48 overflow-y-auto text-sm">
        <ul className="divide-y">
          {entries.map((entry) => {
            const subgroup = extractSubgroupPath(entry.identifier, entry.name)
            return (
              <li key={entry.identifier} className="px-2 py-1">
                {entry.name}
                {subgroup !== null && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({subgroup})
                  </span>
                )}
                {entry.archived && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (archived)
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      <Button size="sm" variant="commit" onClick={onClone} disabled={!canClone}>
        {isCloning ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cloning...
          </>
        ) : (
          `Clone ${entries.length} Repositor${entries.length === 1 ? "y" : "ies"}`
        )}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

/**
 * Returns the portion of the repository identifier that sits ABOVE the leaf
 * name in the Git provider hierarchy (GitLab subgroups), or null when the
 * repository lives directly under the listed namespace. The annotation is
 * shown next to the leaf in the preview so a leaf like `group-30-2iv60` isn't
 * mistaken for a top-level repo when it actually lives inside a team group.
 */
function extractSubgroupPath(identifier: string, name: string): string | null {
  if (identifier === name) return null
  const suffix = `/${name}`
  if (!identifier.endsWith(suffix)) return null
  const subgroup = identifier.slice(0, identifier.length - suffix.length)
  return subgroup.length > 0 ? subgroup : null
}

function formatOperationResult(result: OperationResult): string {
  const time = new Date(result.result.completedAt).toLocaleTimeString()
  if (result.operation === "update") {
    const { prsCreated, prsSkipped, prsFailed } = result.result
    const prs = `${prsCreated} pull request${prsCreated === 1 ? "" : "s"}`
    return `${prs} created (${prsSkipped} skipped, ${prsFailed} failed) at ${time}.`
  }
  if (result.operation === "create") {
    const { repositoriesCreated, repositoriesAdopted } = result.result
    if (repositoriesAdopted > 0) {
      return `${repositoriesCreated} created, ${repositoriesAdopted} adopted at ${time}.`
    }
    const noun = `repositor${repositoriesCreated === 1 ? "y" : "ies"}`
    return `${repositoriesCreated} ${noun} created at ${time}.`
  }
  const count = result.result.repositoriesCloned
  const noun = `repositor${count === 1 ? "y" : "ies"}`
  return `${count} ${noun} cloned at ${time}.`
}
