import type { RepositoryListNamespaceResult } from "@repo-edu/application-contract"
import { Button, Checkbox, Input, Label } from "@repo-edu/ui"
import { Loader2 } from "@repo-edu/ui/components/icons"
import { useRendererHost } from "../../../../contexts/renderer-host.js"
import { extractSubgroupPath } from "./clone-all-repositories.js"
import type { RepoOperations } from "./repository-operation-fields.js"
import { useCloneAllRepositories } from "./use-clone-all-repositories.js"

export function CloneAllRepositoriesPanel({
  operations,
}: {
  readonly operations: RepoOperations
}) {
  const rendererHost = useRendererHost()
  const cloneAll = useCloneAllRepositories({
    activeConnectionId: operations.activeGitConnection?.id ?? null,
    organization: operations.organization,
    initialTargetDirectory: operations.cloneTargetDirectory,
  })

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="clone-all-filter">Name filter</Label>
        <Input
          id="clone-all-filter"
          value={cloneAll.filter}
          onChange={(event) => cloneAll.setFilter(event.target.value)}
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
          checked={cloneAll.includeArchived}
          onCheckedChange={(next) => cloneAll.setIncludeArchived(next === true)}
        />
        <Label htmlFor="clone-all-include-archived">Include archived</Label>
      </div>
      <div className="space-y-1">
        <Label htmlFor="clone-all-target">Target folder</Label>
        <div className="flex gap-1">
          <Input
            id="clone-all-target"
            value={cloneAll.targetDirectory}
            onChange={(event) =>
              cloneAll.setTargetDirectory(event.target.value)
            }
            placeholder="e.g., /Users/me/repos/discovered or ~/repos/discovered"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const directory = await rendererHost.pickDirectory({
                title: "Select clone target folder",
              })
              if (directory) cloneAll.setTargetDirectory(directory)
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
        listResult={cloneAll.listResult}
        listError={cloneAll.listError}
        isListing={cloneAll.isListing}
        isCloning={
          cloneAll.isCloning && cloneAll.mutationBelongsToCurrentCommand
        }
        hasConnection={cloneAll.hasConnection}
        hasNamespace={cloneAll.hasNamespace}
        onClone={cloneAll.handleBulkClone}
        canClone={cloneAll.canClone}
      />

      {cloneAll.isCloning && !cloneAll.mutationBelongsToCurrentCommand && (
        <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Cloning repositories from the previous listing…
        </p>
      )}
      {cloneAll.cloneError && (
        <p className="text-sm text-destructive">
          {!cloneAll.mutationBelongsToCurrentCommand && "Previous clone: "}
          {cloneAll.cloneError}
        </p>
      )}
      {cloneAll.resultSummary && (
        <p className="text-sm text-muted-foreground">
          {!cloneAll.mutationBelongsToCurrentCommand && "Previous clone: "}
          {cloneAll.resultSummary}
        </p>
      )}
    </div>
  )
}

type CloneAllPreviewProps = {
  readonly listResult: RepositoryListNamespaceResult | null
  readonly listError: string | null
  readonly isListing: boolean
  readonly isCloning: boolean
  readonly hasConnection: boolean
  readonly hasNamespace: boolean
  readonly onClone: () => void
  readonly canClone: boolean
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
}: CloneAllPreviewProps) {
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
