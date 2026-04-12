import type { AnalysisProgress } from "@repo-edu/application-contract"
import type { AnalysisResult } from "@repo-edu/domain/analysis"
import {
  Button,
  Checkbox,
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
  FolderOpen,
  GitBranch,
  Loader2,
  Play,
  Square,
} from "@repo-edu/ui/components/icons"
import { useCallback, useRef } from "react"
import { useRendererHost } from "../../../contexts/renderer-host.js"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import { useCourseStore } from "../../../stores/course-store.js"
import { buildAnalysisRosterContext } from "../../../utils/analysis-roster-context.js"

// ---------------------------------------------------------------------------
// Sidebar sections
// ---------------------------------------------------------------------------

function SidebarSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Text className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
        {title}
      </Text>
      {children}
    </div>
  )
}

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
  const asOfCommit = useAnalysisStore((s) => s.asOfCommit)
  const setAsOfCommit = useAnalysisStore((s) => s.setAsOfCommit)
  const result = useAnalysisStore((s) => s.result)
  const blameResult = useAnalysisStore((s) => s.blameResult)

  const searchFolder = useAnalysisStore((s) => s.searchFolder)
  const setSearchFolder = useAnalysisStore((s) => s.setSearchFolder)
  const discoveredRepos = useAnalysisStore((s) => s.discoveredRepos)
  const setDiscoveredRepos = useAnalysisStore((s) => s.setDiscoveredRepos)
  const discoveryStatus = useAnalysisStore((s) => s.discoveryStatus)
  const setDiscoveryStatus = useAnalysisStore((s) => s.setDiscoveryStatus)
  const discoveryError = useAnalysisStore((s) => s.discoveryError)
  const setDiscoveryError = useAnalysisStore((s) => s.setDiscoveryError)

  const rendererHost = useRendererHost()

  const runAnalysis = useCallback(
    async (repoPath: string) => {
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
            config,
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
        if (ac.signal.aborted || !isCurrentRun()) {
          return
        }
        setResult(result)
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
      setWorkflowStatus,
    ],
  )

  const handleBrowseSearchFolder = useCallback(async () => {
    const dir = await rendererHost.pickDirectory({
      title: "Open repository search folder",
    })
    if (!dir) return
    setSearchFolder(dir)
    setSelectedRepoPath(null)
    setDiscoveryStatus("loading")
    setDiscoveryError(null)
    setDiscoveredRepos([])
    try {
      const result = await client.run("analysis.discoverRepos", {
        searchFolder: dir,
      })
      setDiscoveredRepos(result.repos)
      setDiscoveryStatus("idle")
      if (result.repos.length === 1) {
        setSelectedRepoPath(result.repos[0].path)
        runAnalysis(result.repos[0].path)
      }
    } catch (err) {
      setDiscoveryStatus("error")
      setDiscoveryError(err instanceof Error ? err.message : "Discovery failed")
    }
  }, [
    rendererHost,
    client,
    runAnalysis,
    setSearchFolder,
    setSelectedRepoPath,
    setDiscoveryStatus,
    setDiscoveryError,
    setDiscoveredRepos,
  ])

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

  const isRunning = workflowStatus === "running"
  const blameSkip = config.blameSkip ?? false

  const baselineCount = result?.personDbBaseline.persons.length ?? 0
  const overlayCount = blameResult?.personDbOverlay.persons.length
  const delta = blameResult?.delta

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 gap-4">
      {/* Search folder + repo list */}
      <SidebarSection title="Repository">
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={(event) => {
                  event.currentTarget.blur()
                  void handleBrowseSearchFolder()
                }}
              >
                <FolderOpen className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Open repository search folder
            </TooltipContent>
          </Tooltip>
          <Input
            readOnly
            value={searchFolder ?? ""}
            placeholder="Select search folder\u2026"
            className="text-xs truncate cursor-pointer !text-foreground !bg-transparent"
            onClick={handleBrowseSearchFolder}
          />
        </div>

        {discoveryStatus === "loading" && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <span>Scanning\u2026</span>
          </div>
        )}

        {discoveryStatus === "error" && discoveryError && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            {discoveryError}
          </div>
        )}

        {discoveryStatus === "idle" && discoveredRepos.length > 0 && (
          <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
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
          discoveredRepos.length === 0 && (
            <Text className="text-xs text-muted-foreground">
              No repositories found.
            </Text>
          )}
      </SidebarSection>

      <Separator />

      {/* Date range */}
      <SidebarSection title="Date Range">
        <div className="space-y-1.5">
          <Label className="text-xs">Since</Label>
          <Input
            type="text"
            placeholder="YYYY-MM-DD"
            value={config.since ?? ""}
            onChange={(e) => setConfig({ since: e.target.value || undefined })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Until</Label>
          <Input
            type="text"
            placeholder="YYYY-MM-DD"
            value={config.until ?? ""}
            onChange={(e) => setConfig({ until: e.target.value || undefined })}
          />
        </div>
      </SidebarSection>

      <Separator />

      {/* File filters */}
      <SidebarSection title="File Filters">
        <div className="space-y-1.5">
          <Label className="text-xs">Subfolder</Label>
          <Input
            type="text"
            placeholder="src/"
            value={config.subfolder ?? ""}
            onChange={(e) =>
              setConfig({ subfolder: e.target.value || undefined })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Extensions (comma-separated)</Label>
          <Input
            type="text"
            placeholder="ts,tsx,js"
            defaultValue={config.extensions?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setConfig({
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
        <div className="space-y-1.5">
          <Label className="text-xs">Include patterns</Label>
          <Input
            type="text"
            placeholder="*.ts"
            defaultValue={config.includeFiles?.join(", ") ?? ""}
            onBlur={(e) => {
              const raw = e.target.value
              setConfig({
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
        <div className="space-y-1.5">
          <Label className="text-xs">Exclude patterns</Label>
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
      </SidebarSection>

      <Separator />

      {/* Author/Email exclusion */}
      <SidebarSection title="Exclusions">
        <div className="space-y-1.5">
          <Label className="text-xs">Exclude authors</Label>
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
        <div className="space-y-1.5">
          <Label className="text-xs">Exclude emails</Label>
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
        <div className="space-y-1.5">
          <Label className="text-xs">Exclude revisions</Label>
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
        <div className="space-y-1.5">
          <Label className="text-xs">Exclude messages</Label>
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
      </SidebarSection>

      <Separator />

      {/* Options */}
      <SidebarSection title="Options">
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
      </SidebarSection>

      <Separator />

      {/* Blame config */}
      <SidebarSection title="Blame">
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
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Copy/Move Detection (0-4)</Label>
              <Input
                type="number"
                min={0}
                max={4}
                step={1}
                value={blameConfig.copyMove ?? 1}
                onChange={(e) => {
                  const v = Math.min(
                    4,
                    Math.max(0, Number(e.target.value) || 0),
                  )
                  setBlameConfig({ copyMove: v })
                }}
              />
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

            <div className="space-y-1.5">
              <Label className="text-xs">Excluded line display</Label>
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

            <div className="space-y-1.5">
              <Label className="text-xs">As-of commit</Label>
              <Input
                type="text"
                placeholder="HEAD"
                value={asOfCommit}
                onChange={(e) => setAsOfCommit(e.target.value)}
              />
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
      </SidebarSection>

      <Separator />

      {/* Run / Cancel */}
      <div className="space-y-2">
        {isRunning ? (
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleCancel}
          >
            <Square className="mr-1 size-4" />
            Cancel
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={!selectedRepoPath}
            onClick={handleRun}
          >
            {isRunning ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Play className="mr-1 size-4" />
            )}
            Run Analysis
          </Button>
        )}
        {progress && <ProgressDisplay progress={progress} />}
        {errorMessage && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  )
}
