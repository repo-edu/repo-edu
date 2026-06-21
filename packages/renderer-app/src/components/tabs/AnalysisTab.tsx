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
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useAnalysisDiscovery } from "../../analysis/analysis-query-coordinator.js"
import {
  analysisSourceKeyParts,
  analysisSourceScopeKey,
} from "../../analysis/analysis-query-keys.js"
import {
  ANALYSIS_SIDEBAR_DEFAULT_WIDTH_PX,
  ANALYSIS_SIDEBAR_MAX_WIDTH_PX,
  ANALYSIS_SIDEBAR_MIN_WIDTH_PX,
} from "../../constants/layout.js"
import { useAnalysisContext } from "../../hooks/use-analysis-context.js"
import { selectActiveAnalysisSourceKey } from "../../session/selectors.js"
import { useSessionControllerSelector } from "../../session/session-controller-context.js"
import {
  type AnalysisDiscoveryRequest,
  type AnalysisView,
  analysisDiscoveryRequestsEqual,
  selectAutoDiscoveryRequestForScope,
  useAnalysisStore,
} from "../../stores/analysis-store.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { AnalysisSidebar } from "./analysis/AnalysisSidebar.js"
import { AuthorPanel } from "./analysis/AuthorPanel.js"
import { BlamePanel } from "./analysis/BlamePanel.js"
import { BlameProgressBar } from "./analysis/BlameProgressBar.js"
import { FilePanel } from "./analysis/FilePanel.js"
import { RepositoryAnalysisExaminationTab } from "./ExaminationTab.js"
import { canShowExaminationView } from "./examination/view-state.js"
import { SubmissionExaminationTab } from "./SubmissionExaminationTab.js"

function clampSidebarWidthPx(size: number | null | undefined): number {
  const value = size ?? ANALYSIS_SIDEBAR_DEFAULT_WIDTH_PX
  return Math.min(
    ANALYSIS_SIDEBAR_MAX_WIDTH_PX,
    Math.max(ANALYSIS_SIDEBAR_MIN_WIDTH_PX, value),
  )
}

export function AnalysisTab() {
  const analysisContext = useAnalysisContext()
  if (analysisContext.activeSurface.kind === "submission") {
    const submissionSurfaceKey = JSON.stringify([
      analysisContext.activeSurface.courseId ?? null,
      analysisContext.activeSurface.path,
    ])
    return <SubmissionExaminationTab key={submissionSurfaceKey} />
  }
  return <RepositoryAnalysisTab />
}

function RepositoryAnalysisTab() {
  return <RepositoryAnalysisTabContent />
}

function RepositoryAnalysisTabContent() {
  const analysisContext = useAnalysisContext()
  const hasActiveDocument = analysisContext.kind !== "none"

  const initialSidebarWidthPxRef = useRef(
    clampSidebarWidthPx(
      useAppSettingsStore.getState().settings.analysisSidebarSize,
    ),
  )
  const sidebarPanelRef = useRef<ResizablePanelHandle | null>(null)

  const activeView = useAnalysisStore((s) => s.activeView)
  const setActiveView = useAnalysisStore((s) => s.setActiveView)
  const blameSkip = analysisContext.analysisInputs.blameSkip ?? false
  const canShowExamination = canShowExaminationView(blameSkip)

  useEffect(() => {
    if (blameSkip && activeView === "blame") {
      setActiveView("authors")
    }
    // Examination depends on blame attribution — if blame is skipped, it has
    // nothing to work with.
    if (blameSkip && activeView === "examination") {
      setActiveView("authors")
    }
    if (!canShowExamination && activeView === "examination") {
      setActiveView("authors")
    }
  }, [blameSkip, canShowExamination, activeView, setActiveView])

  const { runRepoDiscovery, discoveredRepos, discoveryStatus } =
    useAnalysisDiscovery()
  const searchFolder = analysisContext.searchFolder
  const activeSourceKey = useSessionControllerSelector(
    selectActiveAnalysisSourceKey,
  )
  const activeSourceParts = useMemo(
    () => analysisSourceKeyParts(activeSourceKey),
    [activeSourceKey],
  )
  const activeSourceText = useMemo(
    () => analysisSourceScopeKey(activeSourceParts),
    [activeSourceParts],
  )
  const searchDepth = useAnalysisStore((state) => state.searchDepth)
  const autoDiscoveryRequest = useMemo<AnalysisDiscoveryRequest | null>(
    () =>
      searchFolder === null
        ? null
        : {
            folder: searchFolder,
            depth: searchDepth,
          },
    [searchDepth, searchFolder],
  )
  const markedAutoDiscoveryRequest = useAnalysisStore((state) =>
    selectAutoDiscoveryRequestForScope(state, activeSourceText),
  )
  const markAutoDiscoveryRequest = useAnalysisStore(
    (state) => state.markAutoDiscoveryRequest,
  )
  const hasDiscoveredRepos = discoveredRepos.length > 0
  const runRepoDiscoveryRef = useRef(runRepoDiscovery)
  runRepoDiscoveryRef.current = runRepoDiscovery
  useEffect(() => {
    if (autoDiscoveryRequest === null) return
    if (discoveryStatus === "loading") return
    const shouldAutoDiscover =
      !analysisDiscoveryRequestsEqual(
        markedAutoDiscoveryRequest,
        autoDiscoveryRequest,
      ) && !hasDiscoveredRepos
    if (!shouldAutoDiscover) return
    markAutoDiscoveryRequest(activeSourceText, autoDiscoveryRequest)
    void runRepoDiscoveryRef.current(autoDiscoveryRequest.folder)
  }, [
    activeSourceText,
    autoDiscoveryRequest,
    discoveryStatus,
    hasDiscoveredRepos,
    markedAutoDiscoveryRequest,
    markAutoDiscoveryRequest,
  ])

  const handleLayoutChanged = useCallback(() => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    const { setAnalysisSidebarSize } = useAppSettingsStore.getState()
    setAnalysisSidebarSize(clampSidebarWidthPx(panel.getSize().inPixels))
  }, [])

  if (!hasActiveDocument) {
    return null
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
              {canShowExamination && (
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
          {canShowExamination && (
            <TabsContent
              value="examination"
              className="flex-1 min-h-0 overflow-hidden"
            >
              <RepositoryAnalysisExaminationTab />
            </TabsContent>
          )}
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
