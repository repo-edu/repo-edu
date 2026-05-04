import {
  FormField,
  Input,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import { HelpCircle } from "@repo-edu/ui/components/icons"
import { useState } from "react"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { getErrorMessage } from "../../utils/error-message.js"

function HelpIcon({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex text-muted-foreground hover:text-foreground"
          aria-label="More information"
        >
          <HelpCircle className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

export function PerformancePane() {
  const analysisConcurrency = useAppSettingsStore(
    (s) => s.settings.analysisConcurrency,
  )
  const setAnalysisConcurrency = useAppSettingsStore(
    (s) => s.setAnalysisConcurrency,
  )
  const saveAppSettings = useAppSettingsStore((s) => s.save)
  const [error, setError] = useState<string | null>(null)

  const persist = async () => {
    try {
      await saveAppSettings()
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
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

  const totalProcesses =
    analysisConcurrency.repoParallelism * analysisConcurrency.filesPerRepo

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Text weight="medium">Analysis concurrency</Text>
          <HelpIcon>
            The two values multiply into a budget of total concurrent git
            processes. Log analysis (after "Re-run Analysis") fans out across
            repos using the split — up to {analysisConcurrency.repoParallelism}{" "}
            repos at once, each running up to {analysisConcurrency.filesPerRepo}{" "}
            per-file git operations. Blame runs against one repo at a time, so
            it ignores the split and spends the full budget of {totalProcesses}{" "}
            processes on the selected repo.
          </HelpIcon>
        </div>
        <Text variant="muted" className="text-xs">
          Budget of {totalProcesses} concurrent git processes (
          {analysisConcurrency.repoParallelism} repos ×{" "}
          {analysisConcurrency.filesPerRepo} files).
        </Text>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label={
              <span className="inline-flex items-center gap-1.5">
                Repositories in parallel
                <HelpIcon>
                  How many discovered repos run their git log analysis at the
                  same time during a cohort-wide "Re-run Analysis". Lower this
                  if disk IO thrashes; raise it on fast SSDs with many small
                  repos. Has no effect on blame.
                </HelpIcon>
              </span>
            }
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
            label={
              <span className="inline-flex items-center gap-1.5">
                Files per repository
                <HelpIcon>
                  Concurrent per-file git operations within one repo. During log
                  analysis this caps each repo's inner concurrency; during blame
                  it combines with "Repositories in parallel" into a single
                  budget of {totalProcesses} processes against the selected
                  repo.
                </HelpIcon>
              </span>
            }
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
