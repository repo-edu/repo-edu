import type { AnalysisProgress } from "@repo-edu/application-contract"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Separator,
  Text,
} from "@repo-edu/ui"
import { ChevronDown, ChevronRight } from "@repo-edu/ui/components/icons"
import { useElapsedSeconds } from "./use-elapsed-seconds.js"

export const ANALYSIS_SIDEBAR_SECTION_KEYS = [
  "repositories",
  "files",
  "fileSelection",
  "dateRange",
  "blame",
  "options",
  "exclusions",
] as const

export type AnalysisSidebarSectionKey =
  (typeof ANALYSIS_SIDEBAR_SECTION_KEYS)[number]

export function allAnalysisSidebarSectionsOpen(): Record<
  AnalysisSidebarSectionKey,
  boolean
> {
  return Object.fromEntries(
    ANALYSIS_SIDEBAR_SECTION_KEYS.map((key) => [key, true]),
  ) as Record<AnalysisSidebarSectionKey, boolean>
}

export function CollapsibleSection({
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
  sectionKey: AnalysisSidebarSectionKey
  open: boolean
  onOpenChange: (key: AnalysisSidebarSectionKey, open: boolean) => void
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
        onOpenChange={(value) => onOpenChange(sectionKey, value)}
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

export function ProgressDisplay({ progress }: { progress: AnalysisProgress }) {
  const percent =
    progress.totalFiles > 0
      ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
      : 0
  const elapsedSeconds = useElapsedSeconds(true)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{progress.label}</span>
        <span className="flex items-center gap-2 tabular-nums">
          {elapsedSeconds !== null && <span>{elapsedSeconds}s</span>}
          <span>
            {progress.processedFiles}/{progress.totalFiles}
          </span>
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
