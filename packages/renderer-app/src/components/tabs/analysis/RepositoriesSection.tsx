import {
  Button,
  Input,
  Label,
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
import { useRendererHost } from "../../../contexts/renderer-host.js"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import {
  RepoFolderNode,
  RepoLeafButton,
  RepoTreeProvider,
} from "./analysis-tree.js"
import { useAnalysisWorkflows } from "./use-analysis-workflows.js"
import { useRepoTree } from "./use-repo-tree.js"

export function RepositoriesSection() {
  const { runAnalysis, runRepoDiscovery } = useAnalysisWorkflows()
  const rendererHost = useRendererHost()

  const selectedRepoPath = useAnalysisStore((s) => s.selectedRepoPath)
  const setSelectedRepoPath = useAnalysisStore((s) => s.setSelectedRepoPath)
  const searchFolder = useAnalysisStore((s) => s.searchFolder)
  const setSearchFolder = useAnalysisStore((s) => s.setSearchFolder)
  const searchDepth = useAnalysisStore((s) => s.searchDepth)
  const setSearchDepth = useAnalysisStore((s) => s.setSearchDepth)
  const discoveredRepos = useAnalysisStore((s) => s.discoveredRepos)
  const discoveryStatus = useAnalysisStore((s) => s.discoveryStatus)
  const discoveryError = useAnalysisStore((s) => s.discoveryError)
  const lastDiscoveryOutcome = useAnalysisStore((s) => s.lastDiscoveryOutcome)

  const {
    repoTree,
    repoPathByRelative,
    openRepoFolders,
    searchFolderName,
    toggleRepoFolderOpen,
    expandAllRepoFolders,
    collapseAllRepoFolders,
  } = useRepoTree()

  const handleBrowseSearchFolder = useCallback(async () => {
    const dir = await rendererHost.pickDirectory({
      title: "Open repository search folder",
    })
    if (!dir) return
    setSearchFolder(dir)
    setSelectedRepoPath(null)
    void runRepoDiscovery(dir)
  }, [rendererHost, runRepoDiscovery, setSearchFolder, setSelectedRepoPath])

  const handleSelectRepo = useCallback(
    (path: string) => {
      setSelectedRepoPath(path)
      runAnalysis(path)
    },
    [setSelectedRepoPath, runAnalysis],
  )

  return (
    <>
      {/* Toolbar */}
      {discoveredRepos.length > 0 && (
        <div className="flex items-center gap-1">
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
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {discoveredRepos.length}
          </span>
        </div>
      )}

      {/* Search folder root + repo tree */}
      {discoveredRepos.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-foreground transition-colors hover:bg-accent"
            onClick={handleBrowseSearchFolder}
          >
            <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{searchFolderName}</span>
          </button>
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
        </div>
      ) : (
        <button
          type="button"
          className="w-full rounded px-2 py-1 text-left text-xs italic font-medium text-primary transition-colors hover:bg-accent"
          onClick={handleBrowseSearchFolder}
        >
          Select search folder…
        </button>
      )}

      {discoveryStatus === "loading" && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          <span>Scanning…</span>
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

      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Search depth</Label>
        <Input
          type="number"
          min={1}
          max={9}
          step={1}
          className="w-20"
          value={searchDepth}
          onChange={(e) => {
            const v = Math.min(9, Math.max(1, Number(e.target.value) || 1))
            setSearchDepth(v)
          }}
        />
      </div>
    </>
  )
}
