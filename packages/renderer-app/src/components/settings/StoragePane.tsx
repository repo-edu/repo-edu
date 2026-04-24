import type {
  CacheStatsResult,
  CacheTypeId,
} from "@repo-edu/application-contract"
import { Button, Checkbox, FormField, Input, Text } from "@repo-edu/ui"
import { useCallback, useEffect, useState } from "react"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import {
  analysisStoreInternals,
  useAnalysisStore,
} from "../../stores/analysis-store.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { getErrorMessage } from "../../utils/error-message.js"

const CACHE_TYPE_LABELS: Record<CacheTypeId, string> = {
  analysis: "Analysis results",
  blame: "Blame per-file",
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

export function StoragePane() {
  const cacheEnabled = useAppSettingsStore((s) => s.settings.cacheEnabled)
  const cacheSizeBudgetMB = useAppSettingsStore(
    (s) => s.settings.cacheSizeBudgetMB,
  )
  const analysisConcurrency = useAppSettingsStore(
    (s) => s.settings.analysisConcurrency,
  )
  const setCacheEnabled = useAppSettingsStore((s) => s.setCacheEnabled)
  const setCacheSizeBudgetMB = useAppSettingsStore(
    (s) => s.setCacheSizeBudgetMB,
  )
  const setAnalysisConcurrency = useAppSettingsStore(
    (s) => s.setAnalysisConcurrency,
  )
  const saveAppSettings = useAppSettingsStore((s) => s.save)
  const clearAllRepoStates = useAnalysisStore((s) => s.clearAllRepoStates)

  const [stats, setStats] = useState<CacheStatsResult | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const client = getWorkflowClient()
      const next = await client.run("cache.getStats", undefined)
      setStats(next)
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setLoadingStats(false)
    }
  }, [])

  useEffect(() => {
    void refreshStats()
  }, [refreshStats])

  const persist = async () => {
    try {
      await saveAppSettings()
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  const handleToggleEnabled = (next: boolean) => {
    setCacheEnabled(next)
    void persist()
  }

  const handleBudgetChange = (type: CacheTypeId, raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isInteger(parsed) || parsed < 0) return
    const key = `${type}MB` as keyof typeof cacheSizeBudgetMB
    setCacheSizeBudgetMB({ ...cacheSizeBudgetMB, [key]: parsed })
  }

  const handleRepoParallelismChange = (raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 8) return
    setAnalysisConcurrency({ ...analysisConcurrency, repoParallelism: parsed })
  }

  const handleFilesPerRepoChange = (raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 16) return
    setAnalysisConcurrency({ ...analysisConcurrency, filesPerRepo: parsed })
  }

  const handleFieldCommit = () => {
    void persist()
  }

  const handleClearCache = async () => {
    setClearing(true)
    setError(null)
    analysisStoreInternals.cancelAll()
    analysisStoreInternals.discoveryAbort?.abort()
    analysisStoreInternals.discoveryAbort = null
    clearAllRepoStates()
    try {
      const client = getWorkflowClient()
      await client.run("cache.clearAll", undefined)
      await refreshStats()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="cache-enabled"
            checked={cacheEnabled}
            onCheckedChange={(value) => handleToggleEnabled(value === true)}
          />
          <label htmlFor="cache-enabled" className="text-sm">
            Keep results across restarts
          </label>
        </div>
        <Text variant="muted" className="text-xs">
          Takes effect on next app launch. When off, analysis and blame rerun
          every time.
        </Text>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Text weight="medium">Current size</Text>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearCache}
            disabled={clearing || loadingStats}
          >
            {clearing ? "Clearing..." : "Clear cache"}
          </Button>
        </div>
        <div className="border rounded-md divide-y">
          {stats?.caches.length
            ? stats.caches.map((entry) => (
                <div
                  key={entry.type}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>{CACHE_TYPE_LABELS[entry.type]}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatBytes(entry.coldBytes)} · {entry.coldEntries} entries
                  </span>
                </div>
              ))
            : null}
          {!stats?.caches.length && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {loadingStats ? "Loading..." : "No cache data available."}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <Text weight="medium">Size limits (MB)</Text>
        <Text variant="muted" className="text-xs">
          Takes effect on next app launch.
        </Text>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Analysis" htmlFor="cache-budget-analysis">
            <Input
              id="cache-budget-analysis"
              type="number"
              min={0}
              value={cacheSizeBudgetMB.analysisMB}
              onChange={(e) => handleBudgetChange("analysis", e.target.value)}
              onBlur={handleFieldCommit}
            />
          </FormField>
          <FormField label="Blame" htmlFor="cache-budget-blame">
            <Input
              id="cache-budget-blame"
              type="number"
              min={0}
              value={cacheSizeBudgetMB.blameMB}
              onChange={(e) => handleBudgetChange("blame", e.target.value)}
              onBlur={handleFieldCommit}
            />
          </FormField>
        </div>
      </section>

      <section className="space-y-3">
        <Text weight="medium">Performance</Text>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Repositories in parallel"
            htmlFor="analysis-repo-parallelism"
            description="How many discovered repos analyse at once."
          >
            <Input
              id="analysis-repo-parallelism"
              type="number"
              min={1}
              max={8}
              value={analysisConcurrency.repoParallelism}
              onChange={(e) => handleRepoParallelismChange(e.target.value)}
              onBlur={handleFieldCommit}
            />
          </FormField>
          <FormField
            label="Files per repository"
            htmlFor="analysis-files-per-repo"
            description="Concurrent per-file git operations within one repo."
          >
            <Input
              id="analysis-files-per-repo"
              type="number"
              min={1}
              max={16}
              value={analysisConcurrency.filesPerRepo}
              onChange={(e) => handleFilesPerRepoChange(e.target.value)}
              onBlur={handleFieldCommit}
            />
          </FormField>
        </div>
      </section>

      {error ? (
        <Text variant="destructive" className="text-xs">
          {error}
        </Text>
      ) : null}
    </div>
  )
}
