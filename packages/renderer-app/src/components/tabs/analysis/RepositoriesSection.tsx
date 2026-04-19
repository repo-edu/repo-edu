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
  Loader2,
} from "@repo-edu/ui/components/icons"
import { useCallback } from "react"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import { useCourseStore } from "../../../stores/course-store.js"
import {
  RepoFolderNode,
  RepoLeafButton,
  RepoTreeProvider,
} from "./analysis-tree.js"
import { useAnalysisWorkflows } from "./use-analysis-workflows.js"
import type { RepoTree } from "./use-repo-tree.js"

type RepositoriesToolbarProps = {
  expandAllRepoFolders: () => void
  collapseAllRepoFolders: () => void
  onBrowse: () => void
  browseTooltipKey: number
}

export function RepositoriesToolbar({
  expandAllRepoFolders,
  collapseAllRepoFolders,
  onBrowse,
  browseTooltipKey,
}: RepositoriesToolbarProps) {
  const searchDepth = useAnalysisStore((s) => s.searchDepth)
  const setSearchDepth = useAnalysisStore((s) => s.setSearchDepth)
  const searchFolder = useCourseStore((s) => s.course?.searchFolder) ?? null
  const discoveredRepos = useAnalysisStore((s) => s.discoveredRepos)

  return (
    <>
      {discoveredRepos.length > 0 && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
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
                onClick={collapseAllRepoFolders}
              >
                <ChevronsDownUp className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Collapse all</TooltipContent>
          </Tooltip>
        </>
      )}
      {searchFolder !== null && (
        <Tooltip key={`browse-toolbar-${browseTooltipKey}`}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={onBrowse}
            >
              <FolderOpen className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Change search folder</TooltipContent>
        </Tooltip>
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
            value={searchDepth}
            onChange={(e) => {
              const v = Math.min(9, Math.max(1, Number(e.target.value) || 1))
              setSearchDepth(v)
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
}

export function RepositoriesSection({
  tree,
  onBrowse,
  browseTooltipKey,
}: RepositoriesSectionProps) {
  const { runAnalysis } = useAnalysisWorkflows()

  const selectedRepoPath = useAnalysisStore((s) => s.selectedRepoPath)
  const setSelectedRepoPath = useAnalysisStore((s) => s.setSelectedRepoPath)
  const searchFolder = useCourseStore((s) => s.course?.searchFolder) ?? null
  const discoveredRepos = useAnalysisStore((s) => s.discoveredRepos)
  const discoveryStatus = useAnalysisStore((s) => s.discoveryStatus)
  const discoveryError = useAnalysisStore((s) => s.discoveryError)
  const discoveryCurrentFolder = useAnalysisStore(
    (s) => s.discoveryCurrentFolder,
  )
  const lastDiscoveryOutcome = useAnalysisStore((s) => s.lastDiscoveryOutcome)

  const {
    repoTree,
    repoPathByRelative,
    openRepoFolders,
    searchFolderName,
    toggleRepoFolderOpen,
  } = tree

  const handleSelectRepo = useCallback(
    (path: string) => {
      setSelectedRepoPath(path)
      runAnalysis(path)
    },
    [setSelectedRepoPath, runAnalysis],
  )

  return (
    <>
      {searchFolder !== null ? (
        <div className="flex flex-col gap-0.5">
          <Tooltip key={`browse-folder-${browseTooltipKey}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-foreground transition-colors hover:bg-accent"
                onClick={onBrowse}
                title={searchFolder}
              >
                <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{searchFolderName}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Change search folder</TooltipContent>
          </Tooltip>
          {discoveredRepos.length > 0 && (
            <RepoTreeProvider
              value={{
                openFolders: openRepoFolders,
                toggleFolderOpen: toggleRepoFolderOpen,
                selectedRepoPath,
                repoPathByRelative,
                onRepoClick: handleSelectRepo,
              }}
            >
              <div className="ml-4 flex flex-col gap-0.5">
                {repoTree.children.map((child) => (
                  <RepoFolderNode key={child.path} node={child} />
                ))}
                {repoTree.files.map((relativePath) => (
                  <RepoLeafButton
                    key={relativePath}
                    relativePath={relativePath}
                  />
                ))}
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
