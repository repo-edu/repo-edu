import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ResizablePanelHandle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo-edu/ui"
import { useCallback, useEffect, useRef } from "react"
import {
  ANALYSIS_SIDEBAR_DEFAULT_WIDTH_PX,
  ANALYSIS_SIDEBAR_MAX_WIDTH_PX,
  ANALYSIS_SIDEBAR_MIN_WIDTH_PX,
} from "../../constants/layout.js"
import {
  type AnalysisView,
  useAnalysisStore,
} from "../../stores/analysis-store.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { useCourseStore } from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { NoCourseEmptyState } from "../NoCourseEmptyState.js"
import { AnalysisSidebar } from "./analysis/AnalysisSidebar.js"
import { AuthorPanel } from "./analysis/AuthorPanel.js"
import { BlamePanel } from "./analysis/BlamePanel.js"
import { BlameProgressBar } from "./analysis/BlameProgressBar.js"
import { FilePanel } from "./analysis/FilePanel.js"
import { useAnalysisWorkflows } from "./analysis/use-analysis-workflows.js"
import { useBlameAutoRun } from "./analysis/use-blame-autorun.js"
import { ExaminationTab } from "./ExaminationTab.js"

function clampSidebarWidthPx(size: number | null | undefined): number {
  const value = size ?? ANALYSIS_SIDEBAR_DEFAULT_WIDTH_PX
  return Math.min(
    ANALYSIS_SIDEBAR_MAX_WIDTH_PX,
    Math.max(ANALYSIS_SIDEBAR_MIN_WIDTH_PX, value),
  )
}

export function AnalysisTab() {
  const activeCourseId = useUiStore((s) => s.activeCourseId)
  const course = useCourseStore((s) => s.course)

  const initialSidebarWidthPxRef = useRef(
    clampSidebarWidthPx(
      useAppSettingsStore.getState().settings.analysisSidebarSize,
    ),
  )
  const sidebarPanelRef = useRef<ResizablePanelHandle | null>(null)

  const activeView = useAnalysisStore((s) => s.activeView)
  const setActiveView = useAnalysisStore((s) => s.setActiveView)
  const blameSkip = course?.analysisInputs.blameSkip ?? false

  useEffect(() => {
    if (blameSkip && activeView === "blame") {
      setActiveView("authors")
    }
    // Examination depends on blame attribution — if blame is skipped, it has
    // nothing to work with.
    if (blameSkip && activeView === "examination") {
      setActiveView("authors")
    }
  }, [blameSkip, activeView, setActiveView])

  const { runRepoDiscovery } = useAnalysisWorkflows()
  const searchFolder = course?.searchFolder ?? null
  const hasDiscoveredRepos = useAnalysisStore(
    (s) => s.discoveredRepos.length > 0,
  )
  const discoveryStatus = useAnalysisStore((s) => s.discoveryStatus)
  const settingsStatus = useAppSettingsStore((s) => s.status)
  const didAutoDiscoverRef = useRef(false)
  const runRepoDiscoveryRef = useRef(runRepoDiscovery)
  runRepoDiscoveryRef.current = runRepoDiscovery
  useEffect(() => {
    if (didAutoDiscoverRef.current) return
    if (settingsStatus !== "loaded") return
    if (!searchFolder) return
    if (hasDiscoveredRepos) return
    if (discoveryStatus === "loading") return
    didAutoDiscoverRef.current = true
    void runRepoDiscoveryRef.current(searchFolder)
  }, [settingsStatus, searchFolder, hasDiscoveredRepos, discoveryStatus])

  useBlameAutoRun()

  const handleLayoutChanged = useCallback(() => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    const { setAnalysisSidebarSize, save } = useAppSettingsStore.getState()
    setAnalysisSidebarSize(clampSidebarWidthPx(panel.getSize().inPixels))
    void save()
  }, [])

  if (!activeCourseId || !course) {
    return <NoCourseEmptyState tabLabel="analysis" />
  }

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full min-h-0"
      onLayoutChanged={handleLayoutChanged}
    >
      <ResizablePanel
        id="analysis-sidebar"
        panelRef={sidebarPanelRef}
        defaultSize={`${initialSidebarWidthPxRef.current}px`}
        minSize={`${ANALYSIS_SIDEBAR_MIN_WIDTH_PX}px`}
        maxSize={`${ANALYSIS_SIDEBAR_MAX_WIDTH_PX}px`}
        groupResizeBehavior="preserve-pixel-size"
        className="min-w-0"
      >
        <AnalysisSidebar />
      </ResizablePanel>
      <ResizableHandle className="aria-[orientation=vertical]:w-px aria-[orientation=vertical]:after:absolute aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:-left-1 aria-[orientation=vertical]:after:w-2" />
      <ResizablePanel className="min-w-0">
        <Tabs
          value={activeView}
          onValueChange={(v) => setActiveView(v as AnalysisView)}
          className="flex h-full min-h-0 flex-col"
        >
          <div className="flex items-center border-b px-3">
            <TabsList>
              <TabsTrigger value="authors">Authors</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              {!blameSkip && <TabsTrigger value="blame">Blame</TabsTrigger>}
              {!blameSkip && (
                <TabsTrigger value="examination">Examination</TabsTrigger>
              )}
            </TabsList>
          </div>
          {!blameSkip && <BlameProgressBar />}
          <TabsContent value="authors" className="flex-1 min-h-0 overflow-auto">
            <AuthorPanel />
          </TabsContent>
          <TabsContent value="files" className="flex-1 min-h-0 overflow-auto">
            <FilePanel />
          </TabsContent>
          {!blameSkip && (
            <TabsContent value="blame" className="flex-1 min-h-0 overflow-auto">
              <BlamePanel />
            </TabsContent>
          )}
          {!blameSkip && (
            <TabsContent
              value="examination"
              className="flex-1 min-h-0 overflow-hidden"
            >
              <ExaminationTab />
            </TabsContent>
          )}
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
