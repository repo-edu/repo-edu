import {
  type BlankAnalysisFields,
  createBlankAnalysis,
  type PersistedAnalysis,
} from "@repo-edu/domain/types"
import { useCallback } from "react"
import {
  getWorkflowClient,
  useWorkflowClient,
} from "../contexts/workflow-client.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { useToastStore } from "../stores/toast-store.js"
import { useUiStore } from "../stores/ui-store.js"
import { getErrorMessage } from "../utils/error-message.js"
import { generateCourseId } from "../utils/nanoid.js"

export function useAnalyses() {
  const analysisList = useUiStore((s) => s.analysisList)
  const loading = useUiStore((s) => s.analysisListLoading)
  const client = useWorkflowClient()

  const refresh = useCallback(async () => {
    useUiStore.getState().setAnalysisListLoading(true)
    try {
      const list = await client.run("analyses.list", undefined)
      useUiStore.getState().setAnalysisList(list)
      const activeAnalysisId = useUiStore.getState().activeAnalysisId
      if (
        activeAnalysisId !== null &&
        !list.some((analysis) => analysis.id === activeAnalysisId)
      ) {
        useUiStore.getState().setActiveAnalysisId(null)
        useAppSettingsStore.getState().setActiveAnalysisId(null)
        try {
          await useAppSettingsStore.getState().save()
        } catch {
          // Best-effort persistence on refresh.
        }
      }
    } finally {
      useUiStore.getState().setAnalysisListLoading(false)
    }
  }, [client])

  const switchAnalysis = useCallback(async (analysisId: string) => {
    useUiStore.getState().setActiveDocumentKind("analysis")
    useUiStore.getState().setActiveAnalysisId(analysisId)
    useUiStore.getState().setActiveTab("analysis")
    useAppSettingsStore.getState().setActiveDocumentKind("analysis")
    useAppSettingsStore.getState().setActiveAnalysisId(analysisId)
    try {
      await useAppSettingsStore.getState().save()
    } catch {
      // Keep switching resilient even if settings persistence fails.
    }
  }, [])

  const createAnalysis = useCallback(
    async (fields: BlankAnalysisFields): Promise<PersistedAnalysis | null> => {
      const addToast = useToastStore.getState().addToast
      try {
        const wfClient = getWorkflowClient()
        const draft = createBlankAnalysis(
          generateCourseId(),
          new Date().toISOString(),
          fields,
        )
        const saved = await wfClient.run("analyses.save", draft)
        await refresh()
        await switchAnalysis(saved.id)
        useUiStore.getState().setActiveTab("analysis")
        return saved
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to create analysis: ${message}`, { tone: "error" })
        return null
      }
    },
    [refresh, switchAnalysis],
  )

  const renameAnalysis = useCallback(
    async (analysisId: string, newDisplayName: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      if (!newDisplayName.trim()) return false

      try {
        const wfClient = getWorkflowClient()
        const analysis = await wfClient.run("analyses.load", { analysisId })
        const updated: PersistedAnalysis = {
          ...analysis,
          displayName: newDisplayName.trim(),
        }
        await wfClient.run("analyses.save", updated)
        await refresh()
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to rename analysis: ${message}`, { tone: "error" })
        return false
      }
    },
    [refresh],
  )

  const deleteAnalysis = useCallback(
    async (analysisId: string): Promise<boolean> => {
      const addToast = useToastStore.getState().addToast
      const activeAnalysisId = useUiStore.getState().activeAnalysisId
      const analyses = useUiStore.getState().analysisList
      const isActive = analysisId === activeAnalysisId
      const remaining = analyses.filter((p) => p.id !== analysisId)

      try {
        const wfClient = getWorkflowClient()
        await wfClient.run("analyses.delete", { analysisId })

        if (isActive) {
          useCourseStore.getState().clear()
          useUiStore.getState().setActiveAnalysisId(null)
          useAppSettingsStore.getState().setActiveAnalysisId(null)
          if (remaining.length === 0) {
            useUiStore.getState().setActiveDocumentKind(null)
            useAppSettingsStore.getState().setActiveDocumentKind(null)
          }
          try {
            await useAppSettingsStore.getState().save()
          } catch {
            // Keep delete resilient.
          }
        }

        await refresh()
        return true
      } catch (error) {
        const message = getErrorMessage(error)
        addToast(`Failed to delete analysis: ${message}`, { tone: "error" })
        return false
      }
    },
    [refresh],
  )

  return {
    analyses: analysisList,
    loading,
    refresh,
    switchAnalysis,
    createAnalysis,
    renameAnalysis,
    deleteAnalysis,
  }
}
