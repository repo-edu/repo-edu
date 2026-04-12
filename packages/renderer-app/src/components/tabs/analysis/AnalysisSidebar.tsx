import type { AnalysisProgress } from "@repo-edu/application-contract"
import type { AnalysisConfig, AnalysisResult } from "@repo-edu/domain/analysis"
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
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileCode,
  Folder,
  FolderOpen,
  FolderTree,
  GitBranch,
  List,
  Loader2,
  Play,
  Square,
} from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRendererHost } from "../../../contexts/renderer-host.js"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import { useCourseStore } from "../../../stores/course-store.js"
import { buildAnalysisRosterContext } from "../../../utils/analysis-roster-context.js"

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

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  sectionKey,
  open,
  onOpenChange,
  children,
}: {
  title: string
  sectionKey: SectionKey
  open: boolean
  onOpenChange: (key: SectionKey, open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Collapsible open={open} onOpenChange={(v) => onOpenChange(sectionKey, v)}>
      <CollapsibleTrigger className="w-full justify-between text-xs font-semibold uppercase text-muted-foreground tracking-wider py-1">
        {title}
        {open ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1.5 pt-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
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
  const course = useCourseStore((s) => s.course)
  const client = useWorkflowClient()
  const abortRef = useRef<AbortController | null>(null)
  const discoveryAbortRef = useRef<AbortController | null>(null)

  const config = useAnalysisStore((s) => s.config)
  const setConfig = useAnalysisStore((s) => s.setConfig)
  const selectedRepoPath = useAnalysisStore((s) => s.selectedRepoPath)
  const setSelectedRepoPath = useAnalysisStore((s) => s.setSelectedRepoPath)
  const workflowStatus = useAnalysisStore((s) => s.workflowStatus)
  const progress = useAnalysisStore((s) => s.progress)
  const errorMessage = useAnalysisStore((s) => s.errorMessage)
  const setResult = useAnalysisStore((s) => s.setResult)
  const setWorkflowStatus = useAnalysisStore((s) => s.setWorkflowStatus)
  const setProgress = useAnalysisStore((s) => s.setProgress)
  const setErrorMessage = useAnalysisStore((s) => s.setErrorMessage)

  const blameConfig = useAnalysisStore((s) => s.blameConfig)
  const setBlameConfig = useAnalysisStore((s) => s.setBlameConfig)
  const result = useAnalysisStore((s) => s.result)
  const blameResult = useAnalysisStore((s) => s.blameResult)

  const focusedFilePath = useAnalysisStore((s) => s.focusedFilePath)
  const setFocusedFilePath = useAnalysisStore((s) => s.setFocusedFilePath)
  const fileSelectionMode = useAnalysisStore((s) => s.fileSelectionMode)
  const selectedFiles = useAnalysisStore((s) => s.selectedFiles)
  const activeView = useAnalysisStore((s) => s.activeView)
  const openFileForBlame = useAnalysisStore((s) => s.openFileForBlame)

  const searchFolder = useAnalysisStore((s) => s.searchFolder)
  const setSearchFolder = useAnalysisStore((s) => s.setSearchFolder)
  const searchDepth = useAnalysisStore((s) => s.searchDepth)
  const setSearchDepth = useAnalysisStore((s) => s.setSearchDepth)
  const discoveredRepos = useAnalysisStore((s) => s.discoveredRepos)
  const setDiscoveredRepos = useAnalysisStore((s) => s.setDiscoveredRepos)
  const discoveryStatus = useAnalysisStore((s) => s.discoveryStatus)
  const setDiscoveryStatus = useAnalysisStore((s) => s.setDiscoveryStatus)
  const discoveryError = useAnalysisStore((s) => s.discoveryError)
  const setDiscoveryError = useAnalysisStore((s) => s.setDiscoveryError)
  const lastDiscoveryOutcome = useAnalysisStore((s) => s.lastDiscoveryOutcome)
  const setLastDiscoveryOutcome = useAnalysisStore(
    (s) => s.setLastDiscoveryOutcome,
  )

  const rendererHost = useRendererHost()

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
  const [fileViewMode, setFileViewMode] = useState<"list" | "tree">("tree")
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())

  const ROOT_FOLDER = "(root)"

  const sortedFilePaths = useMemo(
    () => (result?.fileStats ?? []).map((f) => f.path).sort(),
    [result],
  )

  const fileGroups = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const path of sortedFilePaths) {
      const slash = path.lastIndexOf("/")
      const folder = slash < 0 ? ROOT_FOLDER : path.slice(0, slash)
      const group = map.get(folder) ?? []
      group.push(path)
      map.set(folder, group)
    }
    return [...map.entries()]
      .map(([folder, paths]) => ({ folder, paths }))
      .sort((a, b) => a.folder.localeCompare(b.folder))
  }, [sortedFilePaths])

  const allFolderNames = useMemo(
    () => fileGroups.map((g) => g.folder),
    [fileGroups],
  )

  // Default to all folders expanded when results change
  useEffect(() => {
    setOpenFolders(new Set(allFolderNames))
  }, [allFolderNames])

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
      if (activeView === "blame") {
        openFileForBlame(path)
      }
    },
    [activeView, openFileForBlame, setFocusedFilePath],
  )

  const expandAllFolders = useCallback(
    () => setOpenFolders(new Set(allFolderNames)),
    [allFolderNames],
  )
  const collapseAllFolders = useCallback(() => setOpenFolders(new Set()), [])

  const runAnalysis = useCallback(
    async (repoPath: string, configOverride?: AnalysisConfig) => {
      if (!course) return
      const rosterContext = buildAnalysisRosterContext(course)

      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      const isCurrentRun = () => abortRef.current === ac

      setWorkflowStatus("running")
      setProgress(null)
      setErrorMessage(null)
      setResult(null)

      try {
        const result: AnalysisResult = await client.run(
          "analysis.run",
          {
            course,
            repositoryAbsolutePath: repoPath,
            config: configOverride ?? config,
            ...(rosterContext ? { rosterContext } : {}),
          },
          {
            onProgress: (p: AnalysisProgress) => {
              if (!isCurrentRun()) return
              setProgress(p)
            },
            signal: ac.signal,
          },
        )
        if (!isCurrentRun()) {
          return
        }
        if (ac.signal.aborted) {
          setWorkflowStatus("idle")
          return
        }
        setResult(result)
        const paths = result.fileStats.map((f) => f.path).sort()
        setFocusedFilePath(paths[0] ?? null)
        setWorkflowStatus("idle")
      } catch (err) {
        if (!isCurrentRun()) {
          return
        }
        if (ac.signal.aborted) {
          setWorkflowStatus("idle")
        } else {
          setWorkflowStatus("error")
          setErrorMessage(
            err instanceof Error
              ? err.message
              : typeof err === "object" &&
                  err !== null &&
                  "message" in err &&
                  typeof (err as { message: unknown }).message === "string"
                ? (err as { message: string }).message
                : "Analysis failed",
          )
        }
      } finally {
        if (isCurrentRun()) {
          setProgress(null)
          abortRef.current = null
        }
      }
    },
    [
      client,
      config,
      course,
      setErrorMessage,
      setProgress,
      setResult,
      setFocusedFilePath,
      setWorkflowStatus,
    ],
  )

  const runRepoDiscovery = useCallback(
    async (folder: string) => {
      if (!folder) return
      discoveryAbortRef.current?.abort()
      const ac = new AbortController()
      discoveryAbortRef.current = ac
      setLastDiscoveryOutcome("none")
      setDiscoveryStatus("loading")
      setDiscoveryError(null)
      setDiscoveredRepos([])
      try {
        const result = await client.run(
          "analysis.discoverRepos",
          { searchFolder: folder, maxDepth: searchDepth },
          { signal: ac.signal },
        )
        if (discoveryAbortRef.current !== ac) return
        if (ac.signal.aborted) {
          setLastDiscoveryOutcome("cancelled")
          setDiscoveryStatus("idle")
          return
        }
        setSelectedRepoPath(null)
        setDiscoveredRepos(result.repos)
        setLastDiscoveryOutcome("completed")
        setDiscoveryStatus("idle")
        if (result.repos.length === 1) {
          setSelectedRepoPath(result.repos[0].path)
          runAnalysis(result.repos[0].path)
        }
      } catch (err) {
        if (discoveryAbortRef.current !== ac) return
        if (ac.signal.aborted) {
          setLastDiscoveryOutcome("cancelled")
          setDiscoveryStatus("idle")
          return
        }
        setLastDiscoveryOutcome("none")
        setDiscoveryStatus("error")
        setDiscoveryError(
          err instanceof Error ? err.message : "Discovery failed",
        )
      } finally {
        if (discoveryAbortRef.current === ac) {
          discoveryAbortRef.current = null
        }
      }
    },
    [
      client,
      runAnalysis,
      searchDepth,
      setSelectedRepoPath,
      setDiscoveryStatus,
      setDiscoveryError,
      setDiscoveredRepos,
      setLastDiscoveryOutcome,
    ],
  )

  const handleBrowseSearchFolder = useCallback(async () => {
    const dir = await rendererHost.pickDirectory({
      title: "Open repository search folder",
    })
    if (!dir) return
    setSearchFolder(dir)
    setSelectedRepoPath(null)
    void runRepoDiscovery(dir)
  }, [rendererHost, runRepoDiscovery, setSearchFolder, setSelectedRepoPath])

  const handleSearchRepos = useCallback(() => {
    if (!searchFolder) return
    void runRepoDiscovery(searchFolder)
  }, [searchFolder, runRepoDiscovery])

  const handleCancelDiscovery = useCallback(() => {
    discoveryAbortRef.current?.abort()
  }, [])

  const handleRun = useCallback(() => {
    if (selectedRepoPath) runAnalysis(selectedRepoPath)
  }, [selectedRepoPath, runAnalysis])

  const handleSelectRepo = useCallback(
    (path: string) => {
      setSelectedRepoPath(path)
      runAnalysis(path)
    },
    [setSelectedRepoPath, runAnalysis],
  )

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

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
            <Button
              className="flex-1"
              disabled={!selectedRepoPath}
              onClick={handleRun}
            >
              <Play className="mr-1 size-4" />
              Run Analysis
            </Button>
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
      >
        <div>
          <Input
            readOnly
            value={searchFolder ?? ""}
            placeholder="Select search folder…"
            className="text-xs truncate cursor-pointer !text-foreground !bg-transparent placeholder:!text-primary placeholder:font-medium"
            aria-label="Open repository search folder"
            onClick={handleBrowseSearchFolder}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                void handleBrowseSearchFolder()
              }
            }}
          />
        </div>

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

        {discoveryStatus === "idle" && discoveredRepos.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {discoveredRepos.map((repo) => (
              <button
                key={repo.path}
                type="button"
                className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-foreground transition-colors hover:bg-accent ${
                  selectedRepoPath === repo.path ? "bg-accent font-medium" : ""
                }`}
                onClick={() => handleSelectRepo(repo.path)}
              >
                <GitBranch className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{repo.name}</span>
              </button>
            ))}
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
      </CollapsibleSection>

      {/* B. Files */}
      <CollapsibleSection
        title="Files"
        sectionKey="files"
        open={sections.files}
        onOpenChange={handleSectionChange}
      >
        {sortedFilePaths.length === 0 ? (
          <Text className="text-xs text-muted-foreground">
            Run analysis to see files.
          </Text>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-1">
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

              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">
                {effectiveFileSelection.size}/{sortedFilePaths.length}
              </span>
            </div>

            {/* File list */}
            {fileViewMode === "list" ? (
              <div className="flex flex-col gap-0.5">
                {sortedFilePaths.map((path) => (
                  <button
                    key={path}
                    type="button"
                    className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-foreground transition-colors hover:bg-accent ${
                      focusedFilePath === path ? "bg-accent font-medium" : ""
                    }`}
                    onClick={() => handleFileClick(path)}
                  >
                    <FileCode className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate" title={path}>
                      {path}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {fileGroups.map(({ folder, paths }) => {
                  const isOpen = openFolders.has(folder)
                  const selectedCount = paths.filter((p) =>
                    effectiveFileSelection.has(p),
                  ).length
                  return (
                    <div key={folder}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-foreground transition-colors hover:bg-accent"
                        onClick={() => toggleFolderOpen(folder)}
                      >
                        {isOpen ? (
                          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                        )}
                        {isOpen ? (
                          <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <Folder className="size-3 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate font-medium">{folder}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {selectedCount}/{paths.length}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="ml-4 flex flex-col gap-0.5 pt-0.5">
                          {paths.map((path) => {
                            const basename =
                              folder === ROOT_FOLDER
                                ? path
                                : path.slice(folder.length + 1)
                            return (
                              <button
                                key={path}
                                type="button"
                                className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-foreground transition-colors hover:bg-accent ${
                                  focusedFilePath === path
                                    ? "bg-accent font-medium"
                                    : ""
                                }`}
                                onClick={() => handleFileClick(path)}
                              >
                                <FileCode className="size-3 shrink-0 text-muted-foreground" />
                                <span className="truncate" title={path}>
                                  {basename}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
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
      >
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">N files</Label>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-20"
            value={config.nFiles ?? 5}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value) || 0)
              setConfigAndRerun({ nFiles: v })
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Subfolder</Label>
          <Input
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
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Since</Label>
            <Input
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
      >
        <div className="space-y-1">
          <Label className="text-xs">Files</Label>
          <Input
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
