import {
  defaultRepoTemplate,
  planRepositoryOperation,
} from "@repo-edu/domain/repository-planning"
import type { AnalysisResult } from "@repo-edu/domain/analysis"
import type { AnalysisProgress } from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
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
} from "@repo-edu/ui"
import { Loader2, Play, Square } from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import { useCourseStore } from "../../../stores/course-store.js"

// ---------------------------------------------------------------------------
// Repo list derivation
// ---------------------------------------------------------------------------

type RepoOption = {
  label: string
  relativePath: string
}

type CloneDirectoryLayout = "flat" | "by-team" | "by-task"

function normalizeDirectoryLayout(
  value: PersistedCourse["repositoryCloneDirectoryLayout"],
): CloneDirectoryLayout {
  if (value === "by-team" || value === "by-task") {
    return value
  }
  return "flat"
}

function sanitizePathSegment(value: string): string {
  const trimmed = value.trim()
  if (trimmed === "") {
    return "unnamed"
  }
  return trimmed.replace(/[\\/]/g, "_")
}

function toRepositoryRelativePath(
  layout: CloneDirectoryLayout,
  group: {
    assignmentName: string
    groupName: string
    groupId: string
    repoName: string
  },
): string {
  const repoName = sanitizePathSegment(group.repoName)
  if (layout === "flat") {
    return repoName
  }
  if (layout === "by-team") {
    const teamFolder = sanitizePathSegment(
      group.groupName.trim().length > 0 ? group.groupName : group.groupId,
    )
    return `${teamFolder}/${repoName}`
  }
  return `${sanitizePathSegment(group.assignmentName)}/${repoName}`
}

function deriveRepoOptions(course: PersistedCourse): RepoOption[] {
  const options: RepoOption[] = []
  const { roster } = course
  const layout = normalizeDirectoryLayout(course.repositoryCloneDirectoryLayout)
  const seen = new Set<string>()

  for (const assignment of roster.assignments) {
    const groupSet = roster.groupSets.find(
      (gs) => gs.id === assignment.groupSetId,
    )
    if (!groupSet) continue

    const template = groupSet.repoNameTemplate?.trim()
    const plan = planRepositoryOperation(
      roster,
      assignment.id,
      template && template.length > 0 ? template : defaultRepoTemplate,
    )
    if (!plan.ok) continue

    for (const group of plan.value.groups) {
      const relativePath = toRepositoryRelativePath(layout, group)
      if (seen.has(relativePath)) continue
      seen.add(relativePath)
      const groupLabel =
        group.groupName.trim().length > 0 ? group.groupName : group.groupId
      options.push({
        label: `${group.assignmentName} / ${groupLabel}`,
        relativePath,
      })
    }
  }

  return options.sort(
    (a, b) =>
      a.label.localeCompare(b.label) ||
      a.relativePath.localeCompare(b.relativePath),
  )
}

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

  const repoOptions = useMemo(
    () => (course ? deriveRepoOptions(course) : []),
    [course],
  )
  useEffect(() => {
    if (selectedRepoPath === null) return
    const isValid = repoOptions.some(
      (option) => option.relativePath === selectedRepoPath,
    )
    if (!isValid) {
      setSelectedRepoPath(null)
    }
  }, [repoOptions, selectedRepoPath, setSelectedRepoPath])

  const handleRun = useCallback(async () => {
    if (!course || !selectedRepoPath) return

    const ac = new AbortController()
    abortRef.current = ac

    setWorkflowStatus("running")
    setProgress(null)
    setErrorMessage(null)
    setResult(null)

    try {
      const result: AnalysisResult = await client.run(
        "analysis.run",
        {
          course,
          repositoryRelativePath: selectedRepoPath,
          config,
        },
        {
          onProgress: (p: AnalysisProgress) => setProgress(p),
          signal: ac.signal,
        },
      )
      setResult(result)
      setWorkflowStatus("idle")
    } catch (err) {
      if (ac.signal.aborted) {
        setWorkflowStatus("idle")
      } else {
        setWorkflowStatus("error")
        setErrorMessage(err instanceof Error ? err.message : "Analysis failed")
      }
    } finally {
      setProgress(null)
      abortRef.current = null
    }
  }, [
    client,
    config,
    course,
    selectedRepoPath,
    setErrorMessage,
    setProgress,
    setResult,
    setWorkflowStatus,
  ])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const isRunning = workflowStatus === "running"

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 gap-4">
      {/* Repo selection */}
      <SidebarSection title="Repository">
        <Select
          value={selectedRepoPath ?? ""}
          onValueChange={(v) => setSelectedRepoPath(v || null)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select repository..." />
          </SelectTrigger>
          <SelectContent>
            {repoOptions.map((opt) => (
              <SelectItem key={opt.relativePath} value={opt.relativePath}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            value={config.extensions?.join(", ") ?? ""}
            onChange={(e) => {
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
            value={config.includeFiles?.join(", ") ?? ""}
            onChange={(e) => {
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
            value={config.excludeFiles?.join(", ") ?? ""}
            onChange={(e) => {
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
            value={config.excludeAuthors?.join(", ") ?? ""}
            onChange={(e) => {
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
            value={config.excludeEmails?.join(", ") ?? ""}
            onChange={(e) => {
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
            value={config.excludeRevisions?.join(", ") ?? ""}
            onChange={(e) => {
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
            value={config.excludeMessages?.join(", ") ?? ""}
            onChange={(e) => {
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
