import type { PersistedAnalysisSidebarSettings } from "@repo-edu/domain/settings"
import type { AnalysisInputs } from "@repo-edu/domain/types"
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@repo-edu/ui"
import {
  ChevronsDownUp,
  ChevronsUpDown,
  FolderOpen,
  Play,
  RefreshCw,
  Square,
} from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  useAnalysisBlameResult,
  useAnalysisBlameStatus,
  useAnalysisDiscovery,
  useAnalysisFileView,
  useAnalysisResult,
  useAnalysisSelection,
} from "../../../analysis/analysis-query-coordinator.js"
import { selectEffectiveFileSelection } from "../../../analysis/analysis-view-models.js"
import { useRendererHost } from "../../../contexts/renderer-host.js"
import { useAnalysisContext } from "../../../hooks/use-analysis-context.js"
import {
  selectFileSelectionModeForScope,
  selectFocusedFilePathForScope,
  selectSelectedFilesForScope,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import {
  type AnalysisSidebarFileSortMode,
  AnalysisSidebarFilesSection,
  type AnalysisSidebarFileViewMode,
} from "./AnalysisSidebarFilesSection.js"
import { AnalysisSidebarInputSections } from "./AnalysisSidebarInputSections.js"
import {
  ANALYSIS_SIDEBAR_SECTION_KEYS,
  type AnalysisSidebarSectionKey,
  allAnalysisSidebarSectionsOpen,
  CollapsibleSection,
  ProgressDisplay,
} from "./AnalysisSidebarSection.js"
import { buildFileTree, collectFolderPaths } from "./analysis-tree.js"
import {
  RepositoriesSection,
  RepositoriesToolbar,
} from "./RepositoriesSection.js"
import { useRepoTree } from "./use-repo-tree.js"

function serializeSidebarSettings(
  settings: PersistedAnalysisSidebarSettings | null,
): string {
  return JSON.stringify(settings)
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

export function AnalysisSidebar() {
  const {
    runRepoDiscovery,
    cancelDiscovery,
    discoveredRepos,
    discoveryStatus,
  } = useAnalysisDiscovery()
  const {
    runAnalysis,
    cancelAnalysis,
    selectedRepoPath,
    selectRepository,
    analysisScopeKey,
  } = useAnalysisSelection()
  const { result, analysisStatus, analysisProgress, analysisErrorMessage } =
    useAnalysisResult()
  const { blameResult } = useAnalysisBlameResult()
  const { blameStatus } = useAnalysisBlameStatus()
  const { mergedFileStats } = useAnalysisFileView()
  const rendererHost = useRendererHost()

  const analysisContext = useAnalysisContext()
  const setAnalysisInputs = analysisContext.setAnalysisInputs
  const config = analysisContext.analysisInputs
  const searchFolder = analysisContext.searchFolder

  const blameConfig = useAnalysisStore((s) => s.blameConfig)
  const setBlameConfig = useAnalysisStore((s) => s.setBlameConfig)

  const activeView = useAnalysisStore((s) => s.activeView)
  const focusedFilePath = useAnalysisStore((s) =>
    selectFocusedFilePathForScope(s, analysisScopeKey),
  )
  const setFocusedFilePath = useAnalysisStore((s) => s.setFocusedFilePath)
  const fileSelectionMode = useAnalysisStore((s) =>
    selectFileSelectionModeForScope(s, analysisScopeKey),
  )
  const selectedFiles = useAnalysisStore((s) =>
    selectSelectedFilesForScope(s, analysisScopeKey),
  )

  const openFileForBlame = useAnalysisStore((s) => s.openFileForBlame)

  const searchDepth = useAnalysisStore((s) => s.searchDepth)

  // Persistence
  const analysisSidebar = useAppSettingsStore((s) => s.settings.analysisSidebar)
  const setAnalysisSidebar = useAppSettingsStore((s) => s.setAnalysisSidebar)
  const hydrateFromPersistedSettings = useAnalysisStore(
    (s) => s.hydrateFromPersistedSettings,
  )

  // Section open/close state
  const [sections, setSections] = useState<
    Record<AnalysisSidebarSectionKey, boolean>
  >(allAnalysisSidebarSectionsOpen)
  const handleSectionChange = useCallback(
    (key: AnalysisSidebarSectionKey, open: boolean) => {
      setSections((prev) => ({ ...prev, [key]: open }))
    },
    [],
  )

  const expandAll = useCallback(
    () => setSections(allAnalysisSidebarSectionsOpen()),
    [],
  )
  const collapseAll = useCallback(
    () =>
      setSections(
        Object.fromEntries(
          ANALYSIS_SIDEBAR_SECTION_KEYS.map((key) => [key, false]),
        ) as Record<AnalysisSidebarSectionKey, boolean>,
      ),
    [],
  )

  // Repo list view state
  const [repoViewMode, setRepoViewMode] = useState<"list" | "tree">("tree")

  // File list view state
  const [fileViewMode, setFileViewMode] =
    useState<AnalysisSidebarFileViewMode>("list")
  const [fileSortMode, setFileSortMode] =
    useState<AnalysisSidebarFileSortMode>("lines-desc")
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())

  // Hydrate from persisted sidebar settings (once, after app settings load)
  const hydratedRef = useRef(false)
  const lastPersistedSnapshotRef = useRef<string | null>(null)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    if (!analysisSidebar) return
    lastPersistedSnapshotRef.current = serializeSidebarSettings(analysisSidebar)
    hydrateFromPersistedSettings(analysisSidebar)
    setSections({
      ...allAnalysisSidebarSectionsOpen(),
      ...analysisSidebar.sectionState,
      repositories: true,
    })
    setRepoViewMode(analysisSidebar.repoViewMode)
    setFileViewMode(analysisSidebar.fileViewMode)
    setFileSortMode(analysisSidebar.fileSortMode)
  }, [analysisSidebar, hydrateFromPersistedSettings])

  // Persist sidebar settings on change; the settings persister owns debounce.
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
  }, [
    searchDepth,
    sections,
    repoViewMode,
    fileViewMode,
    fileSortMode,
    blameConfig,
    setAnalysisSidebar,
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
    return selectEffectiveFileSelection({
      fileSelectionMode,
      selectedFiles,
      filePaths: sortedFilePaths,
    })
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
      if (analysisScopeKey === null) return
      setFocusedFilePath(analysisScopeKey, path)
      openFileForBlame(analysisScopeKey, path)
    },
    [analysisScopeKey, openFileForBlame, setFocusedFilePath],
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
    if (analysisScopeKey === null) return
    setFocusedFilePath(analysisScopeKey, listFilePaths[0])
  }, [
    analysisScopeKey,
    result,
    focusedFilePath,
    listFilePaths,
    setFocusedFilePath,
  ])

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
    selectRepository(null)
    setSections((prev) => ({ ...prev, repositories: true }))
    if (analysisContext.kind === "folder") {
      await analysisContext.activateFolderPath(dir)
      return
    }
    analysisContext.updateCourseSearchFolder(dir)
    void runRepoDiscovery(dir)
  }, [analysisContext, rendererHost, runRepoDiscovery, selectRepository])

  const handleRun = useCallback(() => {
    if (selectedRepoPath) runAnalysis(selectedRepoPath)
  }, [selectedRepoPath, runAnalysis])

  const setConfigAndRerun = useCallback(
    (patch: Partial<AnalysisInputs>) => {
      setAnalysisInputs(patch)
    },
    [setAnalysisInputs],
  )

  const isAnalysisRunning = analysisStatus === "running"
  const isBlameRunning = blameStatus === "running"
  const isRunning = isAnalysisRunning || isBlameRunning
  const isDiscovering = discoveryStatus === "loading"
  const hasDiscoveredRepos = discoveredRepos.length > 0

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
            <Button variant="destructive" onClick={cancelAnalysis}>
              <Square className="mr-1 size-4" />
              {isBlameRunning ? "Cancel Blame" : "Cancel"}
            </Button>
          ) : isDiscovering ? (
            <Button variant="destructive" onClick={cancelDiscovery}>
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
        {analysisProgress && <ProgressDisplay progress={analysisProgress} />}
        {analysisErrorMessage && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            {analysisErrorMessage}
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

      <AnalysisSidebarFilesSection
        open={sections.files}
        onOpenChange={handleSectionChange}
        sortedFilePaths={sortedFilePaths}
        effectiveFileSelection={effectiveFileSelection}
        nFiles={config.nFiles}
        setConfigAndRerun={setConfigAndRerun}
        blurOnEnter={blurOnEnter}
        fileViewMode={fileViewMode}
        setFileViewMode={setFileViewMode}
        fileSortMode={fileSortMode}
        setFileSortMode={setFileSortMode}
        expandAllFolders={expandAllFolders}
        collapseAllFolders={collapseAllFolders}
        hasResult={result !== null}
        listFilePaths={listFilePaths}
        activeView={activeView}
        focusedFilePath={focusedFilePath}
        handleFileClick={handleFileClick}
        fileTree={fileTree}
        openFolders={openFolders}
        toggleFolderOpen={toggleFolderOpen}
      />

      <AnalysisSidebarInputSections
        sections={sections}
        onOpenChange={handleSectionChange}
        config={config}
        configInputResetKey={configInputResetKey}
        setConfigAndRerun={setConfigAndRerun}
        blurOnEnter={blurOnEnter}
        blameConfig={blameConfig}
        copyMoveDraft={copyMoveDraft}
        setCopyMoveDraft={setCopyMoveDraft}
        commitCopyMoveDraft={commitCopyMoveDraft}
      />
    </div>
  )
}
