import { gitConnectionDisplayLabel } from "@repo-edu/domain/connection"
import {
  gitNamespaceTerminology,
  normalizeGitNamespaceInput,
} from "@repo-edu/domain/repository-namespace"
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
import { Loader2 } from "@repo-edu/ui/components/icons"
import { useRendererHost } from "../../../../contexts/renderer-host.js"
import type {
  CloneDirectoryLayout,
  RepositoryOperationMode,
} from "../../../../utils/repository-workflow.js"
import {
  operationModeLabels,
  selectedOutlineButtonClass,
} from "./operation-mode-copy.js"
import type { useRepoOperations } from "./use-repo-operations.js"

export type RepoOperations = ReturnType<typeof useRepoOperations>

type SharedRepositoryFieldsProps = {
  readonly groupSetId: string
  readonly operations: RepoOperations
}

export function SharedRepositoryFields({
  groupSetId,
  operations,
}: SharedRepositoryFieldsProps) {
  const rawNamespace = operations.organization ?? ""
  const baseUrl = (operations.activeGitConnection?.baseUrl ?? "").replace(
    /\/+$/,
    "",
  )
  const inputRevealsConnection =
    operations.gitConnections.length === 1 &&
    baseUrl.length > 0 &&
    rawNamespace.includes(baseUrl)

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
      <NamespaceField groupSetId={groupSetId} operations={operations} />
      {!inputRevealsConnection && (
        <GitConnectionField groupSetId={groupSetId} operations={operations} />
      )}
    </div>
  )
}

function NamespaceField({
  groupSetId,
  operations,
}: SharedRepositoryFieldsProps) {
  const id = `group-set-${groupSetId}-namespace`
  const connection = operations.activeGitConnection
  const { label, sampleSlug } = gitNamespaceTerminology(connection?.provider)
  const baseUrl = (connection?.baseUrl ?? "").replace(/\/+$/, "")
  const placeholder = baseUrl
    ? `${sampleSlug} or ${baseUrl}/${sampleSlug}`
    : sampleSlug
  const raw = operations.organization ?? ""
  const normalized = normalizeGitNamespaceInput(raw)
  const showPreview = raw.length > 0 && raw !== normalized

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={raw}
        onChange={(event) =>
          operations.setOrganization(event.target.value || null)
        }
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
  operations,
}: SharedRepositoryFieldsProps) {
  const id = `git-connection-${groupSetId}`
  if (operations.gitConnections.length === 0) {
    return (
      <div className="space-y-1">
        <Label>Git connection</Label>
        <p className="text-sm text-destructive">
          Add a Git connection in Settings before running repository operations.
        </p>
      </div>
    )
  }
  if (operations.gitConnections.length === 1) {
    const connection = operations.gitConnections[0]
    const host = connection.baseUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "")
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
        value={operations.activeGitConnection?.id ?? ""}
        onValueChange={(value) => {
          operations.handleSelectActiveGitConnection(value || null)
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operations.gitConnections.map((connection) => (
            <SelectItem key={connection.id} value={connection.id}>
              {gitConnectionDisplayLabel(connection)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {operations.activeGitConnectionId === null &&
        operations.activeGitConnection && (
          <p className="text-xs text-muted-foreground">
            Using {gitConnectionDisplayLabel(operations.activeGitConnection)} by
            default.
          </p>
        )}
    </div>
  )
}

type RepositoryOperationFieldsProps = {
  readonly operation: RepositoryOperationMode
  readonly operations: RepoOperations
  readonly nonEmptyCount: number
  readonly emptyCount: number
}

export function RepositoryOperationFields({
  operation,
  operations,
  nonEmptyCount,
  emptyCount,
}: RepositoryOperationFieldsProps) {
  return (
    <>
      {operation === "create" && <CreateFields operations={operations} />}
      {operation === "update" && <UpdateFields />}
      {operation === "clone" && <CloneFields operations={operations} />}
      <RunRow
        operation={operation}
        operations={operations}
        nonEmptyCount={nonEmptyCount}
        emptyCount={emptyCount}
      />
    </>
  )
}

function CreateFields({ operations }: { operations: RepoOperations }) {
  const rendererHost = useRendererHost()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label>Template Source</Label>
        <Button
          variant="outline"
          className={
            operations.templateKind === "remote"
              ? selectedOutlineButtonClass
              : ""
          }
          size="sm"
          type="button"
          onClick={() => operations.setTemplateKind("remote")}
        >
          Remote
        </Button>
        <Button
          variant="outline"
          className={
            operations.templateKind === "local"
              ? selectedOutlineButtonClass
              : ""
          }
          size="sm"
          type="button"
          onClick={() => operations.setTemplateKind("local")}
        >
          Local
        </Button>
      </div>
      <div className="space-y-1">
        {operations.templateKind === "remote" ? (
          <>
            <Label htmlFor="group-set-create-template-owner">
              Template Org
            </Label>
            <Input
              id="group-set-create-template-owner"
              value={operations.templateOwner}
              onChange={(event) =>
                operations.setTemplateOwner(event.target.value)
              }
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
                value={operations.templateLocalPath}
                onChange={(event) =>
                  operations.setTemplateLocalPath(event.target.value)
                }
                placeholder="e.g., /path/to/template"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const directory = await rendererHost.pickDirectory({
                    title: "Select template repository",
                  })
                  if (directory) operations.setTemplateLocalPath(directory)
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

function UpdateFields() {
  return (
    <p className="text-sm text-muted-foreground">
      Creates pull requests from template changes for the selected assignment's
      repositories. Uses assignment template SHA tracking to open update PRs.
    </p>
  )
}

function CloneFields({ operations }: { operations: RepoOperations }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="space-y-1 md:flex-1">
        <Label htmlFor="group-set-clone-target-folder">Target Folder</Label>
        <Input
          id="group-set-clone-target-folder"
          value={operations.cloneTargetDirectory}
          onChange={(event) =>
            operations.setRepositoryCloneTargetDirectory(
              event.target.value || null,
            )
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
          value={operations.cloneDirectoryLayout}
          onValueChange={(value) =>
            operations.setRepositoryCloneDirectoryLayout(
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
  )
}

function RunRow({
  operation,
  operations,
  nonEmptyCount,
  emptyCount,
}: RepositoryOperationFieldsProps) {
  const { canRun, blockers } = operations.readiness[operation]
  const isRunning = operations.runningOperation === operation

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          size="sm"
          variant="commit"
          onClick={() => void operations.handleRunOperation(operation)}
          disabled={!canRun}
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Running...
            </>
          ) : (
            operationModeLabels[operation]
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
