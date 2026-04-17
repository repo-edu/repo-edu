import type { AnalysisProgress } from "@repo-edu/application-contract"
import type { AnalysisConfig } from "@repo-edu/domain/analysis"
import type { PersistedAnalysisSidebarSettings } from "@repo-edu/domain/settings"
import {
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  ArrowDownAZ,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronUp,
  FileCode,
  FolderTree,
  List,
  Play,
  RefreshCw,
  Square,
} from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { SETTINGS_SAVE_DEBOUNCE_MS } from "../../../constants/layout.js"
import { useRendererHost } from "../../../contexts/renderer-host.js"
import {
  selectBlameMergedFileStats,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import { debounceAsync } from "../../../utils/debounce.js"
import {
  buildFileTree,
  collectFolderPaths,
  FileTreeProvider,
  FolderNode,
} from "./analysis-tree.js"
import {
  RepositoriesSection,
  RepositoriesToolbar,
} from "./RepositoriesSection.js"
import { useAnalysisWorkflows } from "./use-analysis-workflows.js"
import { useRepoTree } from "./use-repo-tree.js"

// ---------------------------------------------------------------------------
// Section keys
// ---------------------------------------------------------------------------

const SECTION_KEYS = [
  "repositories",
  "files",
  "fileSelection",
  "dateRange",
  "blame",
  "options",
  "exclusions",
] as const

type SectionKey = (typeof SECTION_KEYS)[number]

function allSectionsOpen(): Record<SectionKey, boolean> {
  return Object.fromEntries(SECTION_KEYS.map((k) => [k, true])) as Record<
    SectionKey,
    boolean
  >
}

function serializeSidebarSettings(
  settings: PersistedAnalysisSidebarSettings | null,
): string {
  return JSON.stringify(settings)
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  sectionKey,
  open,
  onOpenChange,
  toolbar,
  badge,
  showSeparator,
  children,
}: {
  title: string
  sectionKey: SectionKey
  open: boolean
  onOpenChange: (key: SectionKey, open: boolean) => void
  toolbar?: React.ReactNode
  badge?: React.ReactNode
  showSeparator?: boolean
  children: React.ReactNode
}) {
  return (
    <>
      {showSeparator && <Separator className="my-1" />}
      <Collapsible
        open={open}
        onOpenChange={(v) => onOpenChange(sectionKey, v)}
      >
        <div className="flex items-center py-1">
          <CollapsibleTrigger className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
            {open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {title}
          </CollapsibleTrigger>
          {badge}
          <div className="flex-1" />
          {open && toolbar && (
            <div className="flex items-center gap-1">{toolbar}</div>
          )}
        </div>
        <CollapsibleContent className="space-y-1.5 pt-1">
          {children}
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}

// ---------------------------------------------------------------------------
// Progress display
// ---------------------------------------------------------------------------

function ProgressDisplay({ progress }: { progress: AnalysisProgress }) {
  const percent =
    progress.totalFiles > 0
      ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
      : 0

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{progress.label}</span>
        <span>
          {progress.processedFiles}/{progress.totalFiles}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      {progress.currentFile && (
        <Text className="text-xs text-muted-foreground truncate">
          {progress.currentFile}
        </Text>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Copy-move detection level descriptions
// ---------------------------------------------------------------------------

const COPY_MOVE_LABELS: Record<number, string> = {
  0: "None",
  1: "Within file (-M)",
  2: "Across files (-C)",
  3: "Across commits (-C -C)",
  4: "All commits (-C -C -C)",
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

export function AnalysisSidebar() {
  const { runAnalysis, runRepoDiscovery, handleCancel, handleCancelDiscovery } =
    useAnalysisWorkflows()
  const rendererHost = useRendererHost()

  const config = useAnalysisStore((s) => s.config)
  const setConfig = useAnalysisStore((s) => s.setConfig)
  const selectedRepoPath = useAnalysisStore((s) => s.selectedRepoPath)
  const setSelectedRepoPath = useAnalysisStore((s) => s.setSelectedRepoPath)
  const setSearchFolder = useAnalysisStore((s) => s.setSearchFolder)
  const workflowStatus = useAnalysisStore((s) => s.workflowStatus)
  const progress = useAnalysisStore((s) => s.progress)
  const errorMessage = useAnalysisStore((s) => s.errorMessage)

  const blameConfig = useAnalysisStore((s) => s.blameConfig)
  const setBlameConfig = useAnalysisStore((s) => s.setBlameConfig)
  const result = useAnalysisStore((s) => s.result)
  const blameResult = useAnalysisStore((s) => s.blameResult)

  const activeView = useAnalysisStore((s) => s.activeView)
  const focusedFilePath = useAnalysisStore((s) => s.focusedFilePath)
  const setFocusedFilePath = useAnalysisStore((s) => s.setFocusedFilePath)
  const fileSelectionMode = useAnalysisStore((s) => s.fileSelectionMode)
  const selectedFiles = useAnalysisStore((s) => s.selectedFiles)

  const openFileForBlame = useAnalysisStore((s) => s.openFileForBlame)

  const searchFolder = useAnalysisStore((s) => s.searchFolder)
  const searchDepth = useAnalysisStore((s) => s.searchDepth)
  const discoveredRepos = useAnalysisStore((s) => s.discoveredRepos)
  const discoveryStatus = useAnalysisStore((s) => s.discoveryStatus)

  // Persistence
  const settingsStatus = useAppSettingsStore((s) => s.status)
  const analysisSidebar = useAppSettingsStore((s) => s.settings.analysisSidebar)
  const setAnalysisSidebar = useAppSettingsStore((s) => s.setAnalysisSidebar)
  const saveAppSettings = useAppSettingsStore((s) => s.save)
  const hydrateFromPersistedSettings = useAnalysisStore(
    (s) => s.hydrateFromPersistedSettings,
  )
  const saveDebounced = useMemo(
    () => debounceAsync(saveAppSettings, SETTINGS_SAVE_DEBOUNCE_MS),
    [saveAppSettings],
  )

  // Section open/close state
  const [sections, setSections] =
    useState<Record<SectionKey, boolean>>(allSectionsOpen)
  const handleSectionChange = useCallback((key: SectionKey, open: boolean) => {
    setSections((prev) => ({ ...prev, [key]: open }))
  }, [])

  const expandAll = useCallback(() => setSections(allSectionsOpen()), [])
  const collapseAll = useCallback(
    () =>
      setSections(
        Object.fromEntries(SECTION_KEYS.map((k) => [k, false])) as Record<
          SectionKey,
          boolean
        >,
      ),
    [],
  )

  // File list view state
  const [fileViewMode, setFileViewMode] = useState<"list" | "tree">("list")
  const [fileSortMode, setFileSortMode] = useState<
    "lines-desc" | "lines-asc" | "alpha"
  >("lines-desc")
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())

  // Hydrate from persisted sidebar settings (once, after app settings load)
  const hydratedRef = useRef(false)
  const lastPersistedSnapshotRef = useRef<string | null>(null)
  useEffect(() => {
    if (hydratedRef.current) return
    if (settingsStatus !== "loaded") return
    hydratedRef.current = true
    if (!analysisSidebar) return
    lastPersistedSnapshotRef.current = serializeSidebarSettings(analysisSidebar)
    hydrateFromPersistedSettings(analysisSidebar)
    setSections({ ...allSectionsOpen(), ...analysisSidebar.sectionState })
    setFileViewMode(analysisSidebar.fileViewMode)
    setFileSortMode(analysisSidebar.fileSortMode)
  }, [settingsStatus, analysisSidebar, hydrateFromPersistedSettings])

  // Persist sidebar settings on change (debounced save coalesces with hydration)
  useEffect(() => {
    if (!hydratedRef.current) return
    const snapshot: PersistedAnalysisSidebarSettings = {
      searchFolder,
      searchDepth,
      sectionState: sections,
      fileViewMode,
      fileSortMode,
      config: (() => {
        const { maxConcurrency: _, ...persistedConfig } = config
        return persistedConfig
      })(),
      blameConfig: {
        copyMove: blameConfig.copyMove,
        includeEmptyLines: blameConfig.includeEmptyLines,
        includeComments: blameConfig.includeComments,
        blameExclusions: blameConfig.blameExclusions,
      },
    }
    const snapshotSerialized = serializeSidebarSettings(snapshot)
    if (snapshotSerialized === lastPersistedSnapshotRef.current) {
      return
    }
    setAnalysisSidebar(snapshot)
    lastPersistedSnapshotRef.current = snapshotSerialized
    saveDebounced()
  }, [
    searchFolder,
    searchDepth,
    sections,
    fileViewMode,
    fileSortMode,
    config,
    blameConfig,
    setAnalysisSidebar,
    saveDebounced,
  ])

  const configInputResetKey = useMemo(
    () =>
      JSON.stringify({
        subfolder: config.subfolder ?? "",
        includeFiles: config.includeFiles ?? [],
        extensions: config.extensions ?? [],
        since: config.since ?? "",
        until: config.until ?? "",
        excludeFiles: config.excludeFiles ?? [],
        excludeAuthors: config.excludeAuthors ?? [],
        excludeEmails: config.excludeEmails ?? [],
        excludeRevisions: config.excludeRevisions ?? [],
        excludeMessages: config.excludeMessages ?? [],
      }),
    [config],
  )

  const mergedFileStats = useAnalysisStore(selectBlameMergedFileStats)

  const sortedFilePaths = useMemo(
    () => mergedFileStats.map((f) => f.path).sort(),
    [mergedFileStats],
  )

  const listFilePaths = useMemo(() => {
    if (fileSortMode === "alpha") return sortedFilePaths
    const hasBlame = blameResult !== null
    const sized = mergedFileStats.map((f) => ({
      path: f.path,
      metric: hasBlame ? f.lines : f.bytes,
    }))
    sized.sort((a, b) => {
      const diff = b.metric - a.metric
      if (diff !== 0) return fileSortMode === "lines-desc" ? diff : -diff
      return a.path.localeCompare(b.path)
    })
    return sized.map((f) => f.path)
  }, [mergedFileStats, blameResult, fileSortMode, sortedFilePaths])

  const fileTree = useMemo(
    () => buildFileTree(sortedFilePaths),
    [sortedFilePaths],
  )

  const allFolderNames = useMemo(() => collectFolderPaths(fileTree), [fileTree])

  // Default to all folders collapsed when results change
  useEffect(() => {
    if (result) setOpenFolders(new Set())
  }, [result])

  useEffect(() => {
    if (activeView !== "blame") return
    setSections((prev) => (prev.files ? prev : { ...prev, files: true }))
    if (fileViewMode === "tree") {
      setOpenFolders(new Set(allFolderNames))
    }
  }, [activeView, fileViewMode, allFolderNames])

  const effectiveFileSelection = useMemo(() => {
    if (fileSelectionMode === "all") return new Set(sortedFilePaths)
    return selectedFiles
  }, [fileSelectionMode, selectedFiles, sortedFilePaths])

  const toggleFolderOpen = useCallback((folder: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }, [])

  const handleFileClick = useCallback(
    (path: string) => {
      setFocusedFilePath(path)
      openFileForBlame(path)
    },
    [openFileForBlame, setFocusedFilePath],
  )

  const expandAllFolders = useCallback(
    () => setOpenFolders(new Set(allFolderNames)),
    [allFolderNames],
  )
  const collapseAllFolders = useCallback(() => setOpenFolders(new Set()), [])

  const handleSearchRepos = useCallback(() => {
    if (!searchFolder) return
    void runRepoDiscovery(searchFolder)
  }, [searchFolder, runRepoDiscovery])

  const repoTree = useRepoTree()
  const { expandAllRepoFolders, collapseAllRepoFolders } = repoTree
  const [browseTooltipKey, setBrowseTooltipKey] = useState(0)

  const handleBrowseSearchFolder = useCallback(async () => {
    setBrowseTooltipKey((k) => k + 1)
    const dir = await rendererHost.pickDirectory({
      title: "Open repository search folder",
    })
    if (!dir) return
    setSearchFolder(dir)
    setSelectedRepoPath(null)
    void runRepoDiscovery(dir)
  }, [rendererHost, runRepoDiscovery, setSearchFolder, setSelectedRepoPath])

  const handleRun = useCallback(() => {
    if (selectedRepoPath) runAnalysis(selectedRepoPath)
  }, [selectedRepoPath, runAnalysis])

  const setConfigAndRerun = useCallback(
    (patch: Partial<AnalysisConfig>) => {
      const nextConfig: AnalysisConfig = { ...config, ...patch }
      setConfig(patch)
      if (selectedRepoPath) {
        void runAnalysis(selectedRepoPath, nextConfig)
      }
    },
    [config, runAnalysis, selectedRepoPath, setConfig],
  )

  const isRunning = workflowStatus === "running"
  const isDiscovering = discoveryStatus === "loading"
  const hasDiscoveredRepos = discoveredRepos.length > 0
  const blameSkip = config.blameSkip ?? false

  const baselineCount = result?.personDbBaseline.persons.length ?? 0
  const overlayCount = blameResult?.personDbOverlay.persons.length
  const delta = blameResult?.delta

  return (
    <div className="flex h-full flex-col overflow-y-auto p-2 gap-3">
      {/* Run / Cancel + Expand / Collapse all */}
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          {isRunning ? (
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleCancel}
            >
              <Square className="mr-1 size-4" />
              Cancel
            </Button>
          ) : isDiscovering ? (
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleCancelDiscovery}
            >
              <Square className="mr-1 size-4" />
              Cancel Search
            </Button>
          ) : hasDiscoveredRepos ? (
            result ? (
              <Button
                variant="outline"
                className="flex-1"
                disabled={!selectedRepoPath}
                onClick={handleRun}
              >
                <RefreshCw className="mr-1 size-4" />
                Re-run Analysis
              </Button>
            ) : (
              <Button
                className="flex-1"
                disabled={!selectedRepoPath}
                onClick={handleRun}
              >
                <Play className="mr-1 size-4" />
                Run Analysis
              </Button>
            )
          ) : (
            <Button
              className="flex-1"
              disabled={!searchFolder}
              onClick={handleSearchRepos}
            >
              <Play className="mr-1 size-4" />
              Search Repos
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={expandAll}
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
                onClick={collapseAll}
              >
                <ChevronsDownUp className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Collapse all</TooltipContent>
          </Tooltip>
        </div>
        {progress && <ProgressDisplay progress={progress} />}
        {errorMessage && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            {errorMessage}
          </div>
        )}
      </div>

      {/* A. Repositories */}
      <CollapsibleSection
        title="Repositories"
        sectionKey="repositories"
        open={sections.repositories}
        onOpenChange={handleSectionChange}
        toolbar={
          <RepositoriesToolbar
            expandAllRepoFolders={expandAllRepoFolders}
            collapseAllRepoFolders={collapseAllRepoFolders}
            onBrowse={handleBrowseSearchFolder}
            browseTooltipKey={browseTooltipKey}
          />
        }
        badge={
          discoveredRepos.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {discoveredRepos.length}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {discoveredRepos.length} repositories found
              </TooltipContent>
            </Tooltip>
          ) : undefined
        }
      >
        <RepositoriesSection
          tree={repoTree}
          onBrowse={handleBrowseSearchFolder}
          browseTooltipKey={browseTooltipKey}
        />
      </CollapsibleSection>

      {/* B. Files */}
      <CollapsibleSection
        title="Files"
        sectionKey="files"
        open={sections.files}
        onOpenChange={handleSectionChange}
        showSeparator
        badge={
          <Tooltip>
            <TooltipTrigger asChild>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                size="xs"
                className="ml-1.5 w-10"
                value={config.nFiles ?? 5}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value) || 0)
                  setConfigAndRerun({ nFiles: v })
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom">N files</TooltipContent>
          </Tooltip>
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
                      setFileSortMode((prev) =>
                        prev === "lines-desc"
                          ? "lines-asc"
                          : prev === "lines-asc"
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
              <span className="text-xs text-muted-foreground">
                {effectiveFileSelection.size === sortedFilePaths.length
                  ? sortedFilePaths.length
                  : `${effectiveFileSelection.size}/${sortedFilePaths.length}`}
              </span>
            </>
          )
        }
      >
        {sortedFilePaths.length === 0 ? (
          <Text className="text-xs text-muted-foreground">
            {result
              ? "No files in analysis result."
              : "Run analysis to see files."}
          </Text>
        ) : (
          <>
            {/* File list */}
            {fileViewMode === "list" ? (
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
                        focusedFilePath === path && activeView === "blame"
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
                        <span className="min-w-0 truncate font-medium">
                          {file}
                        </span>
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
          </>
        )}
      </CollapsibleSection>

      {/* C. File Selection */}
      <CollapsibleSection
        title="File Selection"
        sectionKey="fileSelection"
        open={sections.fileSelection}
        onOpenChange={handleSectionChange}
        showSeparator
      >
        <div className="space-y-1">
          <Label className="text-xs">Subfolder</Label>
          <Input
            key={`subfolder-${configInputResetKey}`}
            type="text"
            placeholder="src/"
            defaultValue={config.subfolder ?? ""}
            onBlur={(e) =>
              setConfigAndRerun({ subfolder: e.target.value || undefined })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">File patterns</Label>
          <Input
            key={`include-files-${configInputResetKey}`}
            type="text"
            placeholder="*.ts"
            defaultValue={config.includeFiles?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setConfigAndRerun({
                includeFiles: raw
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Extensions</Label>
          <Input
            key={`extensions-${configInputResetKey}`}
            type="text"
            placeholder="ts,tsx,js"
            defaultValue={config.extensions?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setConfigAndRerun({
                extensions: raw
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }}
          />
        </div>
      </CollapsibleSection>

      {/* C. Date Range */}
      <CollapsibleSection
        title="Date Range"
        sectionKey="dateRange"
        open={sections.dateRange}
        onOpenChange={handleSectionChange}
        showSeparator
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Since</Label>
            <Input
              key={`since-${configInputResetKey}`}
              type="text"
              placeholder="YYYY-MM-DD"
              defaultValue={config.since ?? ""}
              onBlur={(e) =>
                setConfigAndRerun({ since: e.target.value || undefined })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Until</Label>
            <Input
              key={`until-${configInputResetKey}`}
              type="text"
              placeholder="YYYY-MM-DD"
              defaultValue={config.until ?? ""}
              onBlur={(e) =>
                setConfigAndRerun({ until: e.target.value || undefined })
              }
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* D. Blame */}
      <CollapsibleSection
        title="Blame"
        sectionKey="blame"
        open={sections.blame}
        onOpenChange={handleSectionChange}
        showSeparator
      >
        <div className="flex items-center gap-2">
          <Checkbox
            id="blameSkip"
            checked={blameSkip}
            onCheckedChange={(checked) =>
              setConfig({ blameSkip: checked === true })
            }
          />
          <Label htmlFor="blameSkip" className="text-xs">
            Skip blame analysis
          </Label>
        </div>

        {!blameSkip && (
          <div className="space-y-2 pt-1">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Copy/Move</Label>
                <Input
                  type="number"
                  min={0}
                  max={4}
                  step={1}
                  className="w-20"
                  value={blameConfig.copyMove ?? 1}
                  onChange={(e) => {
                    const v = Math.min(
                      4,
                      Math.max(0, Number(e.target.value) || 0),
                    )
                    setBlameConfig({ copyMove: v })
                  }}
                />
              </div>
              <Text className="text-xs text-muted-foreground">
                {COPY_MOVE_LABELS[blameConfig.copyMove ?? 1]}
              </Text>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="includeEmptyLines"
                checked={blameConfig.includeEmptyLines ?? false}
                onCheckedChange={(checked) =>
                  setBlameConfig({ includeEmptyLines: checked === true })
                }
              />
              <Label htmlFor="includeEmptyLines" className="text-xs">
                Include empty lines
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="includeComments"
                checked={blameConfig.includeComments ?? false}
                onCheckedChange={(checked) =>
                  setBlameConfig({ includeComments: checked === true })
                }
              />
              <Label htmlFor="includeComments" className="text-xs">
                Include comments
              </Label>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Excluded lines</Label>
              <Select
                value={blameConfig.blameExclusions ?? "hide"}
                onValueChange={(v) =>
                  setBlameConfig({
                    blameExclusions: v as "hide" | "show" | "remove",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hide">Hide (uncolored)</SelectItem>
                  <SelectItem value="show">Show (colored)</SelectItem>
                  <SelectItem value="remove">Remove (omit)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* PersonDB state indicator */}
            {result && (
              <div className="rounded border bg-muted/50 p-2 space-y-0.5">
                <Text className="text-xs text-muted-foreground">
                  Baseline: {baselineCount} person
                  {baselineCount !== 1 ? "s" : ""}
                </Text>
                {overlayCount !== undefined && (
                  <Text className="text-xs text-muted-foreground">
                    Overlay: {overlayCount} person
                    {overlayCount !== 1 ? "s" : ""}
                    {delta &&
                      (delta.newPersons.length > 0 ||
                        delta.newAliases.length > 0 ||
                        delta.relinkedIdentities.length > 0) && (
                        <span>
                          {" "}
                          (+{delta.newPersons.length} new, +
                          {delta.newAliases.length} alias
                          {delta.newAliases.length !== 1 ? "es" : ""}, +
                          {delta.relinkedIdentities.length} relinked)
                        </span>
                      )}
                  </Text>
                )}
              </div>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* E. Options */}
      <CollapsibleSection
        title="Options"
        sectionKey="options"
        open={sections.options}
        onOpenChange={handleSectionChange}
        showSeparator
      >
        <div className="flex items-center gap-2">
          <Checkbox
            id="whitespace"
            checked={config.whitespace ?? false}
            onCheckedChange={(checked) =>
              setConfig({ whitespace: checked === true })
            }
          />
          <Label htmlFor="whitespace" className="text-xs">
            Include whitespace changes
          </Label>
        </div>
      </CollapsibleSection>

      {/* F. Exclusions */}
      <CollapsibleSection
        title="Exclusions"
        sectionKey="exclusions"
        open={sections.exclusions}
        onOpenChange={handleSectionChange}
        showSeparator
      >
        <div className="space-y-1">
          <Label className="text-xs">Files</Label>
          <Input
            key={`exclude-files-${configInputResetKey}`}
            type="text"
            placeholder="*.test.ts"
            defaultValue={config.excludeFiles?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setConfig({
                excludeFiles: raw
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Authors</Label>
          <Input
            key={`exclude-authors-${configInputResetKey}`}
            type="text"
            placeholder="bot*"
            defaultValue={config.excludeAuthors?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setConfig({
                excludeAuthors: raw
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Emails</Label>
          <Input
            key={`exclude-emails-${configInputResetKey}`}
            type="text"
            placeholder="noreply@*"
            defaultValue={config.excludeEmails?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setConfig({
                excludeEmails: raw
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Revisions</Label>
          <Input
            key={`exclude-revisions-${configInputResetKey}`}
            type="text"
            placeholder="abc1234"
            defaultValue={config.excludeRevisions?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setConfig({
                excludeRevisions: raw
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Messages</Label>
          <Input
            key={`exclude-messages-${configInputResetKey}`}
            type="text"
            placeholder="merge*"
            defaultValue={config.excludeMessages?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setConfig({
                excludeMessages: raw
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }}
          />
        </div>
      </CollapsibleSection>
    </div>
  )
}
