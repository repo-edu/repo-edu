import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo-edu/ui"
import { useCallback, useMemo } from "react"
import {
  ANALYSIS_SIDEBAR_DEFAULT_WIDTH_PX,
  ANALYSIS_SIDEBAR_MAX_WIDTH_PX,
  ANALYSIS_SIDEBAR_MIN_WIDTH_PX,
  RESIZE_DEBOUNCE_MS,
} from "../../constants/layout.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import {
  type AnalysisView,
  useAnalysisStore,
} from "../../stores/analysis-store.js"
import { useCourseStore } from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { debounceAsync } from "../../utils/debounce.js"
import { NoCourseEmptyState } from "../NoCourseEmptyState.js"
import { AnalysisSidebar } from "./analysis/AnalysisSidebar.js"
import { AuthorFilesPanel } from "./analysis/AuthorFilesPanel.js"
import { AuthorPanel } from "./analysis/AuthorPanel.js"
import { FileAuthorsPanel } from "./analysis/FileAuthorsPanel.js"
import { FilePanel } from "./analysis/FilePanel.js"

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

  const analysisSidebarSize = useAppSettingsStore(
    (s) => s.settings.analysisSidebarSize,
  )
  const setAnalysisSidebarSize = useAppSettingsStore(
    (s) => s.setAnalysisSidebarSize,
  )
  const saveAppSettings = useAppSettingsStore((s) => s.save)
  const sidebarWidthPx = clampSidebarWidthPx(analysisSidebarSize)
  const saveAppSettingsDebounced = useMemo(
    () => debounceAsync(saveAppSettings, RESIZE_DEBOUNCE_MS),
    [saveAppSettings],
  )

  const activeView = useAnalysisStore((s) => s.activeView)
  const setActiveView = useAnalysisStore((s) => s.setActiveView)

  const handleSidebarResize = useCallback(
    (
      panelSize: { inPixels: number },
      _id: string | number | undefined,
      previousPanelSize: { inPixels: number } | undefined,
    ) => {
      if (!previousPanelSize) return
      setAnalysisSidebarSize(clampSidebarWidthPx(panelSize.inPixels))
      saveAppSettingsDebounced()
    },
    [saveAppSettingsDebounced, setAnalysisSidebarSize],
  )

  if (!activeCourseId || !course) {
    return <NoCourseEmptyState tabLabel="analysis" />
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
      <ResizablePanel
        id="analysis-sidebar"
        defaultSize={`${sidebarWidthPx}px`}
        minSize={`${ANALYSIS_SIDEBAR_MIN_WIDTH_PX}px`}
        maxSize={`${ANALYSIS_SIDEBAR_MAX_WIDTH_PX}px`}
        groupResizeBehavior="preserve-pixel-size"
        onResize={handleSidebarResize}
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
              <TabsTrigger value="authors-files">Authors-Files</TabsTrigger>
              <TabsTrigger value="files-authors">Files-Authors</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="authors" className="flex-1 min-h-0 overflow-auto">
            <AuthorPanel />
          </TabsContent>
          <TabsContent
            value="authors-files"
            className="flex-1 min-h-0 overflow-auto"
          >
            <AuthorFilesPanel />
          </TabsContent>
          <TabsContent
            value="files-authors"
            className="flex-1 min-h-0 overflow-auto"
          >
            <FileAuthorsPanel />
          </TabsContent>
          <TabsContent value="files" className="flex-1 min-h-0 overflow-auto">
            <FilePanel />
          </TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
