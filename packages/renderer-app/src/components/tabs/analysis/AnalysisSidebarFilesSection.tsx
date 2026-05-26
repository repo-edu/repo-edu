import type { AnalysisInputs } from "@repo-edu/domain/types"
import {
  Button,
  Input,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  ArrowDownAZ,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronUp,
  FileCode,
  FolderTree,
  List,
} from "@repo-edu/ui/components/icons"
import type { AnalysisView } from "../../../stores/analysis-store.js"
import {
  type AnalysisSidebarSectionKey,
  CollapsibleSection,
} from "./AnalysisSidebarSection.js"
import {
  type buildFileTree,
  FileTreeProvider,
  FolderNode,
} from "./analysis-tree.js"

export type AnalysisSidebarFileViewMode = "list" | "tree"
export type AnalysisSidebarFileSortMode = "lines-desc" | "lines-asc" | "alpha"

export function AnalysisSidebarFilesSection({
  open,
  onOpenChange,
  sortedFilePaths,
  effectiveFileSelection,
  nFiles,
  setConfigAndRerun,
  blurOnEnter,
  fileViewMode,
  setFileViewMode,
  fileSortMode,
  setFileSortMode,
  expandAllFolders,
  collapseAllFolders,
  hasResult,
  listFilePaths,
  activeView,
  focusedFilePath,
  handleFileClick,
  fileTree,
  openFolders,
  toggleFolderOpen,
}: {
  open: boolean
  onOpenChange: (key: AnalysisSidebarSectionKey, open: boolean) => void
  sortedFilePaths: string[]
  effectiveFileSelection: Set<string>
  nFiles: number | undefined
  setConfigAndRerun: (patch: Partial<AnalysisInputs>) => void
  blurOnEnter: (event: React.KeyboardEvent<HTMLInputElement>) => void
  fileViewMode: AnalysisSidebarFileViewMode
  setFileViewMode: (mode: AnalysisSidebarFileViewMode) => void
  fileSortMode: AnalysisSidebarFileSortMode
  setFileSortMode: React.Dispatch<
    React.SetStateAction<AnalysisSidebarFileSortMode>
  >
  expandAllFolders: () => void
  collapseAllFolders: () => void
  hasResult: boolean
  listFilePaths: string[]
  activeView: AnalysisView
  focusedFilePath: string | null
  handleFileClick: (path: string) => void
  fileTree: ReturnType<typeof buildFileTree>
  openFolders: Set<string>
  toggleFolderOpen: (folder: string) => void
}) {
  return (
    <CollapsibleSection
      title="Files"
      sectionKey="files"
      open={open}
      onOpenChange={onOpenChange}
      showSeparator
      badge={
        <div className="ml-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            {effectiveFileSelection.size === sortedFilePaths.length
              ? sortedFilePaths.length
              : `${effectiveFileSelection.size}/${sortedFilePaths.length}`}
          </span>
          <span>max</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                size="xs"
                className="w-10"
                value={nFiles ?? ""}
                onChange={(event) => {
                  const raw = event.target.value.trim()
                  if (raw === "") {
                    setConfigAndRerun({ nFiles: undefined })
                    return
                  }
                  const parsed = Number(raw)
                  if (!Number.isFinite(parsed)) return
                  const value = Math.max(1, Math.trunc(parsed))
                  setConfigAndRerun({ nFiles: value })
                }}
                onKeyDown={blurOnEnter}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom">N files</TooltipContent>
          </Tooltip>
        </div>
      }
      toolbar={
        sortedFilePaths.length > 0 && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={fileViewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="size-6 shrink-0"
                  onClick={() => setFileViewMode("list")}
                >
                  <List className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">List view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={fileViewMode === "tree" ? "secondary" : "ghost"}
                  size="icon"
                  className="size-6 shrink-0"
                  onClick={() => setFileViewMode("tree")}
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
                  disabled={fileViewMode !== "tree"}
                  onClick={expandAllFolders}
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
                  disabled={fileViewMode !== "tree"}
                  onClick={collapseAllFolders}
                >
                  <ChevronsDownUp className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Collapse all</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  disabled={fileViewMode !== "list"}
                  onClick={() =>
                    setFileSortMode((previous) =>
                      previous === "lines-desc"
                        ? "lines-asc"
                        : previous === "lines-asc"
                          ? "alpha"
                          : "lines-desc",
                    )
                  }
                >
                  {fileSortMode === "lines-desc" ? (
                    <ChevronDown className="size-3.5" />
                  ) : fileSortMode === "lines-asc" ? (
                    <ChevronUp className="size-3.5" />
                  ) : (
                    <ArrowDownAZ className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {fileSortMode === "lines-desc"
                  ? "Sort: lines (high to low)"
                  : fileSortMode === "lines-asc"
                    ? "Sort: lines (low to high)"
                    : "Sort: alphabetical"}
              </TooltipContent>
            </Tooltip>
          </>
        )
      }
    >
      {sortedFilePaths.length === 0 ? (
        <Text className="text-xs text-muted-foreground">
          {hasResult
            ? "No files in analysis result."
            : "Run analysis to see files."}
        </Text>
      ) : fileViewMode === "list" ? (
        <div className="flex flex-col gap-0.5">
          {listFilePaths.map((path) => {
            const slashIdx = path.lastIndexOf("/")
            const dir = slashIdx >= 0 ? `${path.slice(0, slashIdx)}/` : ""
            const file = slashIdx >= 0 ? path.slice(slashIdx + 1) : path
            return (
              <button
                key={path}
                type="button"
                className={`flex min-w-0 items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-foreground transition-colors ${
                  activeView === "blame" && focusedFilePath === path
                    ? "bg-selection font-medium"
                    : "hover:bg-accent"
                }`}
                onClick={() => handleFileClick(path)}
                title={path}
              >
                <FileCode className="size-3 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {dir}
                  </span>
                  <span className="min-w-0 truncate font-medium">{file}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <FileTreeProvider
          value={{
            openFolders,
            toggleFolderOpen,
            effectiveFileSelection,
            focusedFilePath,
            highlightFocused: activeView === "blame",
            onFileClick: handleFileClick,
          }}
        >
          <div className="flex flex-col gap-0.5">
            {fileTree.files.length > 0 ? (
              <FolderNode node={fileTree} />
            ) : (
              fileTree.children.map((child) => (
                <FolderNode key={child.path} node={child} />
              ))
            )}
          </div>
        </FileTreeProvider>
      )}
    </CollapsibleSection>
  )
}
