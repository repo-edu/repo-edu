import {
  Button,
  Input,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  ChevronsDownUp,
  ChevronsUpDown,
  FolderOpen,
  FolderTree,
  List,
  Loader2,
  RefreshCw,
} from "@repo-edu/ui/components/icons"
import { useCallback, useState } from "react"
import {
  useAnalysisDiscovery,
  useAnalysisSelection,
} from "../../../analysis/analysis-query-coordinator.js"
import { useAnalysisContext } from "../../../hooks/use-analysis-context.js"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import {
  RepoFolderNode,
  RepoLeafButton,
  RepoTreeProvider,
} from "./analysis-tree.js"
import type { RepoTree } from "./use-repo-tree.js"

type RepositoriesToolbarProps = {
  expandAllRepoFolders: () => void
  collapseAllRepoFolders: () => void
  onSearchRepos: () => void
  searchReposDisabled: boolean
  repoViewMode: "list" | "tree"
  setRepoViewMode: (mode: "list" | "tree") => void
}

export function RepositoriesToolbar({
  expandAllRepoFolders,
  collapseAllRepoFolders,
  onSearchRepos,
  searchReposDisabled,
  repoViewMode,
  setRepoViewMode,
}: RepositoriesToolbarProps) {
  const searchDepth = useAnalysisStore((s) => s.searchDepth)
  const setSearchDepth = useAnalysisStore((s) => s.setSearchDepth)
  const { discoveredRepos } = useAnalysisDiscovery()

  const [depthDraft, setDepthDraft] = useState<string | null>(null)
  const commitDepthDraft = useCallback(() => {
    if (depthDraft === null) return
    const parsed = Number(depthDraft)
    const v = Number.isFinite(parsed)
      ? Math.min(9, Math.max(1, Math.trunc(parsed)))
      : 1
    setSearchDepth(v)
    setDepthDraft(null)
  }, [depthDraft, setSearchDepth])

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            disabled={searchReposDisabled}
            onClick={onSearchRepos}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Re-search repositories</TooltipContent>
      </Tooltip>
      {discoveredRepos.length > 0 && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={repoViewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="size-6 shrink-0"
                onClick={() => setRepoViewMode("list")}
              >
                <List className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">List view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={repoViewMode === "tree" ? "secondary" : "ghost"}
                size="icon"
                className="size-6 shrink-0"
                onClick={() => setRepoViewMode("tree")}
              >
                <FolderTree className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Tree view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                disabled={repoViewMode !== "tree"}
                onClick={expandAllRepoFolders}
              >
                <ChevronsUpDown className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Expand all</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                disabled={repoViewMode !== "tree"}
                onClick={collapseAllRepoFolders}
              >
                <ChevronsDownUp className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Collapse all</TooltipContent>
          </Tooltip>
        </>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Input
            type="number"
            min={1}
            max={9}
            step={1}
            size="xs"
            variant="borderless"
            className="w-12"
            value={depthDraft ?? String(searchDepth)}
            onChange={(e) => setDepthDraft(e.target.value)}
            onBlur={commitDepthDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
            }}
          />
        </TooltipTrigger>
        <TooltipContent side="bottom">Search depth</TooltipContent>
      </Tooltip>
    </>
  )
}

type RepositoriesSectionProps = {
  tree: RepoTree
  onBrowse: () => void
  browseTooltipKey: number
  repoViewMode: "list" | "tree"
}

export function RepositoriesSection({
  tree,
  onBrowse,
  browseTooltipKey,
  repoViewMode,
}: RepositoriesSectionProps) {
  const analysisContext = useAnalysisContext()
  const {
    discoveredRepos,
    discoveryStatus,
    discoveryError,
    discoveryCurrentFolder,
    lastDiscoveryOutcome,
  } = useAnalysisDiscovery()
  const { selectedRepoPath, selectRepository } = useAnalysisSelection()
  const searchFolder = analysisContext.searchFolder

  const {
    repoTree,
    repoPathByRelative,
    openRepoFolders,
    searchFolderName,
    searchFolderIsRepo,
    toggleRepoFolderOpen,
  } = tree
  const handleSelectRepo = useCallback(
    (path: string) => {
      if (path === selectedRepoPath) return
      selectRepository(path)
    },
    [selectedRepoPath, selectRepository],
  )

  return (
    <>
      {searchFolder !== null ? (
        <div className="flex flex-col gap-0.5">
          {!searchFolderIsRepo && (
            <Tooltip key={`browse-folder-${browseTooltipKey}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-foreground transition-colors hover:bg-accent"
                  onClick={onBrowse}
                  title={searchFolder}
                >
                  <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">
                    {searchFolderName}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Change search folder
              </TooltipContent>
            </Tooltip>
          )}
          {discoveredRepos.length > 0 && (
            <RepoTreeProvider
              value={{
                openFolders: openRepoFolders,
                toggleFolderOpen: toggleRepoFolderOpen,
                selectedRepoPath,
                repoPathByRelative,
                onRepoClick: searchFolderIsRepo ? onBrowse : handleSelectRepo,
                viewMode: searchFolderIsRepo ? "tree" : repoViewMode,
              }}
            >
              <div
                className={`flex flex-col gap-0.5 ${searchFolderIsRepo ? "" : "ml-4"}`}
              >
                {repoViewMode === "list" || searchFolderIsRepo ? (
                  [...repoPathByRelative.keys()]
                    .sort((a, b) => a.localeCompare(b))
                    .map((relativePath) => (
                      <RepoLeafButton
                        key={relativePath}
                        relativePath={relativePath}
                      />
                    ))
                ) : (
                  <>
                    {repoTree.children.map((child) => (
                      <RepoFolderNode key={child.path} node={child} />
                    ))}
                    {repoTree.files.map((relativePath) => (
                      <RepoLeafButton
                        key={relativePath}
                        relativePath={relativePath}
                      />
                    ))}
                  </>
                )}
              </div>
            </RepoTreeProvider>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="w-full rounded px-2 py-1 text-left text-xs italic font-medium text-primary transition-colors hover:bg-accent"
          onClick={onBrowse}
        >
          Select search folder…
        </button>
      )}

      {discoveryStatus === "loading" && (
        <div
          className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
          title={discoveryCurrentFolder ?? undefined}
        >
          <Loader2 className="size-3 shrink-0 animate-spin" />
          <span className="min-w-0 truncate">
            {discoveryCurrentFolder ?? "Scanning…"}
          </span>
        </div>
      )}

      {discoveryStatus === "error" && discoveryError && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
          {discoveryError}
        </div>
      )}

      {discoveryStatus === "idle" &&
        searchFolder !== null &&
        lastDiscoveryOutcome === "completed" &&
        discoveredRepos.length === 0 && (
          <Text className="text-xs text-muted-foreground">
            No repositories found.
          </Text>
        )}
    </>
  )
}
