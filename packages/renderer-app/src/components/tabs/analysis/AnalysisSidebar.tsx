import type { AnalysisProgress } from "@repo-edu/application-contract"
import type { AnalysisConfig } from "@repo-edu/domain/analysis"
import type { PersistedAnalysisSidebarSettings } from "@repo-edu/domain/settings"
import type { CourseAnalysisInputs } from "@repo-edu/domain/types"
import { resolveCourseAnalysisConfig } from "@repo-edu/domain/types"
import {
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
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
  FolderOpen,
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
import { useCourseStore } from "../../../stores/course-store.js"
import { debounceAsync } from "../../../utils/debounce.js"
import { ExtensionTagInput } from "../../settings/ExtensionTagInput.js"
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
  leading,
  badge,
  showSeparator,
  children,
}: {
  title: string
  sectionKey: SectionKey
  open: boolean
  onOpenChange: (key: SectionKey, open: boolean) => void
  toolbar?: React.ReactNode
  leading?: React.ReactNode
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
          <CollapsibleTrigger>
            {open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </CollapsibleTrigger>
          {leading}
          <CollapsibleTrigger className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
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

  const course = useCourseStore((s) => s.course)
  const setAnalysisInputs = useCourseStore((s) => s.setAnalysisInputs)
  const setSearchFolder = useCourseStore((s) => s.setSearchFolder)
  const config = course?.analysisInputs ?? ({} as CourseAnalysisInputs)
  const searchFolder = course?.searchFolder ?? null

  const selectedRepoPath = useAnalysisStore((s) => s.selectedRepoPath)
  const setSelectedRepoPath = useAnalysisStore((s) => s.setSelectedRepoPath)
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

  const searchDepth = useAnalysisStore((s) => s.searchDepth)
  const discoveredRepos = useAnalysisStore((s) => s.discoveredRepos)
  const discoveryStatus = useAnalysisStore((s) => s.discoveryStatus)

  // Persistence
  const settingsStatus = useAppSettingsStore((s) => s.status)
  const defaultExtensions = useAppSettingsStore(
    (s) => s.settings.defaultExtensions,
  )
  const filesPerRepo = useAppSettingsStore(
    (s) => s.settings.analysisConcurrency.filesPerRepo,
  )
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

  // Repo list view state
  const [repoViewMode, setRepoViewMode] = useState<"list" | "tree">("tree")

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
    setSections({
      ...allSectionsOpen(),
      ...analysisSidebar.sectionState,
      repositories: true,
    })
    setRepoViewMode(analysisSidebar.repoViewMode)
    setFileViewMode(analysisSidebar.fileViewMode)
    setFileSortMode(analysisSidebar.fileSortMode)
  }, [settingsStatus, analysisSidebar, hydrateFromPersistedSettings])

  // Persist sidebar settings on change (debounced save coalesces with hydration)
  useEffect(() => {
    if (!hydratedRef.current) return
    const snapshot: PersistedAnalysisSidebarSettings = {
      searchDepth,
      sectionState: sections,
      repoViewMode,
      fileViewMode,
      fileSortMode,
      blameConfig: {
        copyMove: blameConfig.copyMove,
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
    searchDepth,
    sections,
    repoViewMode,
    fileViewMode,
    fileSortMode,
    blameConfig,
    setAnalysisSidebar,
    saveDebounced,
  ])

  const configInputResetKey = useMemo(
    () =>
      JSON.stringify({
        subfolder: config.subfolder ?? "",
        includeFiles: config.includeFiles ?? [],
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

  useEffect(() => {
    if (activeView !== "blame") return
    setSections((prev) => (prev.files ? prev : { ...prev, files: true }))
    if (fileViewMode === "tree") {
      setOpenFolders(new Set(allFolderNames))
    }
    if (
      fileViewMode === "list" &&
      !focusedFilePath &&
      listFilePaths.length > 0
    ) {
      handleFileClick(listFilePaths[0])
    }
  }, [
    activeView,
    fileViewMode,
    allFolderNames,
    focusedFilePath,
    listFilePaths,
    handleFileClick,
  ])

  useEffect(() => {
    if (!result) return
    if (focusedFilePath) return
    if (listFilePaths.length === 0) return
    setFocusedFilePath(listFilePaths[0])
  }, [result, focusedFilePath, listFilePaths, setFocusedFilePath])

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
    setSections((prev) => ({ ...prev, repositories: true }))
    void runRepoDiscovery(dir)
  }, [rendererHost, runRepoDiscovery, setSearchFolder, setSelectedRepoPath])

  const handleRun = useCallback(() => {
    if (selectedRepoPath) runAnalysis(selectedRepoPath)
  }, [selectedRepoPath, runAnalysis])

  const setConfigAndRerun = useCallback(
    (patch: Partial<CourseAnalysisInputs>) => {
      setAnalysisInputs(patch)
      if (selectedRepoPath && course) {
        const nextCourse = {
          ...course,
          analysisInputs: { ...course.analysisInputs, ...patch },
        }
        const nextConfig: AnalysisConfig = resolveCourseAnalysisConfig(
          nextCourse,
          defaultExtensions,
          filesPerRepo,
        )
        void runAnalysis(selectedRepoPath, nextConfig)
      }
    },
    [
      course,
      defaultExtensions,
      filesPerRepo,
      runAnalysis,
      selectedRepoPath,
      setAnalysisInputs,
    ],
  )

  const isRunning = workflowStatus === "running"
  const isDiscovering = discoveryStatus === "loading"
  const hasDiscoveredRepos = discoveredRepos.length > 0
  const blameSkip = config.blameSkip ?? false

  const blurOnEnter = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") e.currentTarget.blur()
    },
    [],
  )

  const [copyMoveDraft, setCopyMoveDraft] = useState<string | null>(null)
  const commitCopyMoveDraft = useCallback(() => {
    if (copyMoveDraft === null) return
    const parsed = Number(copyMoveDraft)
    const v = Number.isFinite(parsed)
      ? Math.min(4, Math.max(0, Math.trunc(parsed)))
      : 0
    setBlameConfig({ copyMove: v })
    setCopyMoveDraft(null)
  }, [copyMoveDraft, setBlameConfig])

  return (
    <div className="flex h-full flex-col overflow-y-auto p-2 gap-3">
      {/* Run / Cancel + Expand / Collapse all */}
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          {isRunning ? (
            <Button variant="destructive" onClick={handleCancel}>
              <Square className="mr-1 size-4" />
              Cancel
            </Button>
          ) : isDiscovering ? (
            <Button variant="destructive" onClick={handleCancelDiscovery}>
              <Square className="mr-1 size-4" />
              Cancel Search
            </Button>
          ) : hasDiscoveredRepos ? (
            result ? (
              <Button
                variant="outline"
                disabled={!selectedRepoPath}
                onClick={handleRun}
              >
                <RefreshCw className="mr-1 size-4" />
                Re-run Analysis
              </Button>
            ) : (
              <Button disabled={!selectedRepoPath} onClick={handleRun}>
                <Play className="mr-1 size-4" />
                Run Analysis
              </Button>
            )
          ) : (
            <Button disabled={!searchFolder} onClick={handleSearchRepos}>
              <Play className="mr-1 size-4" />
              Search Repos
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-6 shrink-0"
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
        title="Repos"
        sectionKey="repositories"
        open={sections.repositories}
        onOpenChange={handleSectionChange}
        toolbar={
          <RepositoriesToolbar
            expandAllRepoFolders={expandAllRepoFolders}
            collapseAllRepoFolders={collapseAllRepoFolders}
            onSearchRepos={handleSearchRepos}
            searchReposDisabled={!searchFolder || isRunning || isDiscovering}
            repoViewMode={repoViewMode}
            setRepoViewMode={setRepoViewMode}
          />
        }
        leading={
          searchFolder !== null && (
            <Tooltip key={`browse-badge-${browseTooltipKey}`}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-1 size-6 shrink-0"
                  onClick={handleBrowseSearchFolder}
                >
                  <FolderOpen className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Change search folder
              </TooltipContent>
            </Tooltip>
          )
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
          repoViewMode={repoViewMode}
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
                  value={config.nFiles ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    if (raw === "") {
                      setConfigAndRerun({ nFiles: undefined })
                      return
                    }
                    const parsed = Number(raw)
                    if (!Number.isFinite(parsed)) return
                    const v = Math.max(1, Math.trunc(parsed))
                    setConfigAndRerun({ nFiles: v })
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
            size="xs"
            placeholder="src/"
            defaultValue={config.subfolder ?? ""}
            onBlur={(e) =>
              setConfigAndRerun({ subfolder: e.target.value || undefined })
            }
            onKeyDown={blurOnEnter}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">File patterns</Label>
          <Input
            key={`include-files-${configInputResetKey}`}
            type="text"
            size="xs"
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
            onKeyDown={blurOnEnter}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Extensions</Label>
          <ExtensionTagInput
            size="xs"
            values={config.extensions ?? []}
            onChange={(next) =>
              setConfigAndRerun({
                extensions: next.length === 0 ? undefined : next,
              })
            }
            placeholder="ts, tsx, js"
            ariaLabel="Extensions"
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
              size="xs"
              placeholder="YYYY-MM-DD"
              defaultValue={config.since ?? ""}
              onBlur={(e) =>
                setConfigAndRerun({ since: e.target.value || undefined })
              }
              onKeyDown={blurOnEnter}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Until</Label>
            <Input
              key={`until-${configInputResetKey}`}
              type="text"
              size="xs"
              placeholder="YYYY-MM-DD"
              defaultValue={config.until ?? ""}
              onBlur={(e) =>
                setConfigAndRerun({ until: e.target.value || undefined })
              }
              onKeyDown={blurOnEnter}
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
              setAnalysisInputs({ blameSkip: checked === true })
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
                  size="xs"
                  min={0}
                  max={4}
                  step={1}
                  className="w-12"
                  value={copyMoveDraft ?? String(blameConfig.copyMove ?? 1)}
                  onChange={(e) => setCopyMoveDraft(e.target.value)}
                  onBlur={commitCopyMoveDraft}
                  onKeyDown={blurOnEnter}
                />
              </div>
              <Text className="text-xs text-muted-foreground">
                {COPY_MOVE_LABELS[blameConfig.copyMove ?? 1]}
              </Text>
            </div>
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
              setAnalysisInputs({ whitespace: checked === true })
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
            size="xs"
            placeholder="*.test.ts"
            defaultValue={config.excludeFiles?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setAnalysisInputs({
                excludeFiles: raw
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }}
            onKeyDown={blurOnEnter}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Authors</Label>
          <Input
            key={`exclude-authors-${configInputResetKey}`}
            type="text"
            size="xs"
            placeholder="bot*"
            defaultValue={config.excludeAuthors?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setAnalysisInputs({
                excludeAuthors: raw
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }}
            onKeyDown={blurOnEnter}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Emails</Label>
          <Input
            key={`exclude-emails-${configInputResetKey}`}
            type="text"
            size="xs"
            placeholder="noreply@*"
            defaultValue={config.excludeEmails?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setAnalysisInputs({
                excludeEmails: raw
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }}
            onKeyDown={blurOnEnter}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Revisions</Label>
          <Input
            key={`exclude-revisions-${configInputResetKey}`}
            type="text"
            size="xs"
            placeholder="abc1234"
            defaultValue={config.excludeRevisions?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setAnalysisInputs({
                excludeRevisions: raw
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }}
            onKeyDown={blurOnEnter}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Messages</Label>
          <Input
            key={`exclude-messages-${configInputResetKey}`}
            type="text"
            size="xs"
            placeholder="merge*"
            defaultValue={config.excludeMessages?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setAnalysisInputs({
                excludeMessages: raw
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : undefined,
              })
            }}
            onKeyDown={blurOnEnter}
          />
        </div>
      </CollapsibleSection>
    </div>
  )
}
