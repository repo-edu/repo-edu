import { AppRoot, useCourseStore, useUiStore } from "@repo-edu/renderer-app"
import { useEffect, useMemo, useRef } from "react"
import "../../../../packages/renderer-app/src/App.css"
import { createDocsDemoRuntime } from "../demo-runtime.js"
import {
  type DocsFixtureSource,
  resolveDocsFixtureSelection,
} from "../fixtures/docs-fixtures.js"

function FileSourceSelectionBridge({ source }: { source: DocsFixtureSource }) {
  const activeTab = useUiStore((state) => state.activeTab)
  const activeCourseId = useUiStore((state) => state.activeCourseId)
  const setActiveTab = useUiStore((state) => state.setActiveTab)
  const sidebarSelection = useUiStore((state) => state.sidebarSelection)
  const setSidebarSelection = useUiStore((state) => state.setSidebarSelection)
  const groupSets = useCourseStore((state) => state.course?.roster.groupSets)
  const appliedBySourceRef = useRef<Record<DocsFixtureSource, boolean>>({
    canvas: false,
    moodle: false,
    file: false,
  })

  useEffect(() => {
    appliedBySourceRef.current[source] = false
  }, [source])

  useEffect(() => {
    if (source !== "file") {
      return
    }
    if (!activeCourseId || appliedBySourceRef.current.file) {
      return
    }
    if (activeTab !== "groups-assignments") {
      setActiveTab("groups-assignments")
    }
  }, [activeCourseId, activeTab, setActiveTab, source])

  useEffect(() => {
    if (
      source !== "file" ||
      !activeCourseId ||
      appliedBySourceRef.current.file ||
      !groupSets ||
      groupSets.length === 0
    ) {
      return
    }

    const repobeeGroupSet = groupSets.find(
      (groupSet) =>
        groupSet.nameMode === "unnamed" &&
        groupSet.connection?.kind === "import",
    )
    if (!repobeeGroupSet) {
      return
    }

    if (
      !(
        sidebarSelection?.kind === "group-set" &&
        sidebarSelection.id === repobeeGroupSet.id
      )
    ) {
      setSidebarSelection({ kind: "group-set", id: repobeeGroupSet.id })
    }
    appliedBySourceRef.current.file = true
  }, [activeCourseId, groupSets, setSidebarSelection, sidebarSelection, source])

  return null
}

export default function DemoApp() {
  const selection = useMemo(() => resolveDocsFixtureSelection(), [])
  const runtime = useMemo(
    () =>
      createDocsDemoRuntime({
        source: selection.source,
      }),
    [selection],
  )

  return (
    <>
      <AppRoot
        workflowClient={runtime.workflowClient}
        rendererHost={runtime.rendererHost}
      />
      <FileSourceSelectionBridge source={selection.source} />
    </>
  )
}
