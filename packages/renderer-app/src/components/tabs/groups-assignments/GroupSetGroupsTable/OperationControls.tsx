import type { PersistedGitConnection } from "@repo-edu/domain/settings"
import { gitConnectionDisplayLabel } from "@repo-edu/domain/settings"
import {
  Button,
  Collapsible,
  CollapsibleContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import { ChevronDown, Loader2 } from "@repo-edu/ui/components/icons"
import { useRendererHost } from "../../../../contexts/renderer-host.js"
import { useUiStore } from "../../../../stores/ui-store.js"
import type {
  CloneDirectoryLayout,
  RepositoryOperationMode,
} from "../../../../utils/repository-workflow.js"
import type { OperationResult, OperationStatus } from "./use-repo-operations.js"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type OperationControlsProps = {
  groupSetId: string
  disabled: boolean

  // Operation state
  operationStatus: OperationStatus
  runningOperation: RepositoryOperationMode | null
  operationError: string | null
  lastResult: OperationResult | null
  handleRunOperation: (operation: RepositoryOperationMode) => Promise<void>

  // Readiness
  gitConnections: readonly PersistedGitConnection[]
  activeGitConnection: PersistedGitConnection | null
  activeGitConnectionId: string | null
  handleSelectActiveGitConnection: (id: string | null) => Promise<void>
  hasBaseOperationInputs: boolean
  hasUpdateOperationInputs: boolean

  // Counts
  nonEmptyCount: number
  emptyCount: number

  // Organization
  organization: string | null
  setOrganization: (org: string | null) => void

  // Template
  templateKind: "remote" | "local"
  templateOwner: string
  templateLocalPath: string
  setTemplateKind: (kind: "remote" | "local") => void
  setTemplateOwner: (owner: string) => void
  setTemplateLocalPath: (path: string) => void

  // Clone settings
  cloneTargetDirectory: string
  cloneDirectoryLayout: CloneDirectoryLayout
  setRepositoryCloneTargetDirectory: (dir: string | null) => void
  setRepositoryCloneDirectoryLayout: (
    layout: CloneDirectoryLayout | null | undefined,
  ) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const selectedOutlineButtonClass =
  "!bg-selection ![background-image:none] !text-foreground"

export function OperationControls(props: OperationControlsProps) {
  const {
    groupSetId,
    disabled,
    operationStatus: _operationStatus,
    runningOperation,
    operationError,
    lastResult,
    handleRunOperation,
    gitConnections,
    activeGitConnection,
    activeGitConnectionId,
    handleSelectActiveGitConnection,
    hasBaseOperationInputs,
    hasUpdateOperationInputs,
    nonEmptyCount,
    emptyCount,
    organization,
    setOrganization,
    templateKind,
    templateOwner,
    templateLocalPath,
    setTemplateKind,
    setTemplateOwner,
    setTemplateLocalPath,
    cloneTargetDirectory,
    cloneDirectoryLayout,
    setRepositoryCloneTargetDirectory,
    setRepositoryCloneDirectoryLayout,
  } = props

  const rendererHost = useRendererHost()
  const groupOperationSectionByGroupSet = useUiStore(
    (s) => s.groupOperationSectionByGroupSet,
  )
  const setGroupOperationSection = useUiStore((s) => s.setGroupOperationSection)

  const openSection = groupOperationSectionByGroupSet[groupSetId] ?? null

  return (
    <div className="px-3 py-2 space-y-2 border-b">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className={openSection === "create" ? selectedOutlineButtonClass : ""}
          disabled={disabled}
          onClick={() =>
            setGroupOperationSection(
              groupSetId,
              openSection === "create" ? null : "create",
            )
          }
        >
          Create Repos
          <ChevronDown
            className={`ml-1 size-4 transition-transform ${
              openSection === "create" ? "rotate-180" : ""
            }`}
          />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={openSection === "update" ? selectedOutlineButtonClass : ""}
          disabled={disabled}
          onClick={() =>
            setGroupOperationSection(
              groupSetId,
              openSection === "update" ? null : "update",
            )
          }
        >
          Update Repos
          <ChevronDown
            className={`ml-1 size-4 transition-transform ${
              openSection === "update" ? "rotate-180" : ""
            }`}
          />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={openSection === "clone" ? selectedOutlineButtonClass : ""}
          disabled={disabled}
          onClick={() =>
            setGroupOperationSection(
              groupSetId,
              openSection === "clone" ? null : "clone",
            )
          }
        >
          Clone Repos
          <ChevronDown
            className={`ml-1 size-4 transition-transform ${
              openSection === "clone" ? "rotate-180" : ""
            }`}
          />
        </Button>
      </div>

      {/* Create section */}
      <Collapsible open={openSection === "create"}>
        <CollapsibleContent>
          <div className="border rounded-md p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Label>Template Source</Label>
              <Button
                variant="outline"
                className={
                  templateKind === "remote" ? selectedOutlineButtonClass : ""
                }
                size="sm"
                type="button"
                onClick={() => setTemplateKind("remote")}
              >
                Remote
              </Button>
              <Button
                variant="outline"
                className={
                  templateKind === "local" ? selectedOutlineButtonClass : ""
                }
                size="sm"
                type="button"
                onClick={() => setTemplateKind("local")}
              >
                Local
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="group-set-create-organization">
                  Organization
                </Label>
                <Input
                  id="group-set-create-organization"
                  value={organization ?? ""}
                  onChange={(event) =>
                    setOrganization(event.target.value || null)
                  }
                  placeholder="e.g., course-org"
                />
              </div>
              <div className="space-y-1">
                {templateKind === "remote" ? (
                  <>
                    <Label htmlFor="group-set-create-template-owner">
                      Template Org
                    </Label>
                    <Input
                      id="group-set-create-template-owner"
                      value={templateOwner}
                      onChange={(event) => setTemplateOwner(event.target.value)}
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
                        value={templateLocalPath}
                        onChange={(event) =>
                          setTemplateLocalPath(event.target.value)
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
                          if (dir) setTemplateLocalPath(dir)
                        }}
                      >
                        Browse
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                size="sm"
                onClick={() => void handleRunOperation("create")}
                disabled={!hasBaseOperationInputs}
              >
                {runningOperation === "create" ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  "Create Repos"
                )}
              </Button>
              <div className="text-sm text-muted-foreground">
                Will create {nonEmptyCount} repositor
                {nonEmptyCount === 1 ? "y" : "ies"}.
                {emptyCount > 0 && (
                  <span className="ml-1">
                    {emptyCount} empty group
                    {emptyCount === 1 ? "" : "s"} will be skipped.
                  </span>
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Update section */}
      <Collapsible open={openSection === "update"}>
        <CollapsibleContent>
          <div className="border rounded-md p-3 space-y-3">
            <div className="text-sm text-muted-foreground">
              Creates pull requests from template changes for the selected
              assignment's repositories.
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                size="sm"
                onClick={() => void handleRunOperation("update")}
                disabled={!hasUpdateOperationInputs}
              >
                {runningOperation === "update" ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  "Update Repos"
                )}
              </Button>
              <div className="text-sm text-muted-foreground">
                Uses assignment template SHA tracking to open update PRs.
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Clone section */}
      <Collapsible open={openSection === "clone"}>
        <CollapsibleContent>
          <div className="border rounded-md p-3 space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="space-y-1 md:flex-1">
                <Label htmlFor="group-set-clone-target-folder">
                  Target Folder
                </Label>
                <Input
                  id="group-set-clone-target-folder"
                  value={cloneTargetDirectory}
                  onChange={(event) =>
                    setRepositoryCloneTargetDirectory(
                      event.target.value || null,
                    )
                  }
                  placeholder="e.g., ~/repos/course"
                />
              </div>
              <div className="space-y-1 md:ml-auto md:shrink-0">
                <Label htmlFor="group-set-clone-layout">Directory Layout</Label>
                <Select
                  value={cloneDirectoryLayout}
                  onValueChange={(value) =>
                    setRepositoryCloneDirectoryLayout(
                      value as CloneDirectoryLayout,
                    )
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                size="sm"
                onClick={() => void handleRunOperation("clone")}
                disabled={
                  !hasBaseOperationInputs ||
                  cloneTargetDirectory.trim().length === 0
                }
              >
                {runningOperation === "clone" ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  "Clone Repos"
                )}
              </Button>
              <div className="text-sm text-muted-foreground">
                Will clone {nonEmptyCount} repositor
                {nonEmptyCount === 1 ? "y" : "ies"}.
                {emptyCount > 0 && (
                  <span className="ml-1">
                    {emptyCount} empty group
                    {emptyCount === 1 ? "" : "s"} will be skipped.
                  </span>
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Git-connection binding (profile-level) */}
      {openSection !== null && gitConnections.length === 0 && (
        <p className="text-sm text-destructive">
          No Git connection is configured. Add one in Settings before running
          repository operations.
        </p>
      )}
      {openSection !== null && gitConnections.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <Label htmlFor={`git-connection-${groupSetId}`}>Git connection</Label>
          <Select
            value={activeGitConnection?.id ?? ""}
            onValueChange={(value) => {
              void handleSelectActiveGitConnection(value || null)
            }}
          >
            <SelectTrigger
              id={`git-connection-${groupSetId}`}
              className="w-auto"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {gitConnections.map((connection) => (
                <SelectItem key={connection.id} value={connection.id}>
                  {gitConnectionDisplayLabel(connection)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeGitConnectionId === null && activeGitConnection && (
            <span className="text-xs text-muted-foreground">
              Using {gitConnectionDisplayLabel(activeGitConnection)} by default.
            </span>
          )}
        </div>
      )}
      {operationError && (
        <p className="text-sm text-destructive">{operationError}</p>
      )}
      {lastResult && (
        <p className="text-sm text-muted-foreground">
          {lastResult.operation === "update"
            ? `${lastResult.result.prsCreated} pull request${lastResult.result.prsCreated === 1 ? "" : "s"} created (${lastResult.result.prsSkipped} skipped, ${lastResult.result.prsFailed} failed)`
            : `${lastResult.operation === "create" ? lastResult.result.repositoriesCreated : lastResult.result.repositoriesCloned} repositor${
                (
                  lastResult.operation === "create"
                    ? lastResult.result.repositoriesCreated
                    : lastResult.result.repositoriesCloned
                ) === 1
                  ? "y"
                  : "ies"
              } ${lastResult.operation === "create" ? "created" : "cloned"}`}{" "}
          at {new Date(lastResult.result.completedAt).toLocaleTimeString()}.
        </p>
      )}
    </div>
  )
}
