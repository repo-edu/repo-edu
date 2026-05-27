import { buildExaminationLocalIdentityContext } from "@repo-edu/application-contract"
import { Button, EmptyState } from "@repo-edu/ui"
import { useMemo } from "react"
import { useAnalysisContext } from "../../hooks/use-analysis-context.js"
import {
  selectAuthorDisplayByPersonId,
  useAnalysisStore,
} from "../../stores/analysis-store.js"
import { useExaminationStore } from "../../stores/examination-store.js"
import { LlmControls } from "./examination/LlmControls.js"
import { SubjectList } from "./examination/SubjectList.js"
import { SubjectPanel } from "./examination/SubjectPanel.js"
import type {
  CourseExaminationSource,
  SourceSubject,
} from "./examination/source.js"
import { useExaminationEngine } from "./examination/use-examination-engine.js"
import {
  resolveExaminationEmptyState,
  shouldShowUnmatchedRosterWarning,
} from "./examination/view-state.js"

export function CourseExaminationTab() {
  const analysisContext = useAnalysisContext()
  const blameResult = useAnalysisStore((state) => state.blameResult)
  const analysisResult = useAnalysisStore((state) => state.result)
  const selectedRepoPath = useAnalysisStore((state) => state.selectedRepoPath)
  const asOfCommit = useAnalysisStore((state) => state.asOfCommit)
  const authorDisplays = useAnalysisStore(selectAuthorDisplayByPersonId)
  const selectedPersonId = useExaminationStore(
    (state) => state.selectedPersonId,
  )

  const authorSummaries = blameResult?.authorSummaries ?? []
  const emptyStateMessage = resolveExaminationEmptyState({
    selectedRepositoryPath: selectedRepoPath,
    hasBlameResult: blameResult !== null,
    authorCount: authorSummaries.length,
    selectedPersonId,
  })
  const commitOid = useMemo(() => {
    const resolved = analysisResult?.resolvedAsOfOid
    if (resolved && resolved.length > 0) return resolved
    return asOfCommit ?? ""
  }, [analysisResult, asOfCommit])

  const source = useMemo<CourseExaminationSource | null>(() => {
    if (
      selectedRepoPath === null ||
      blameResult === null ||
      authorSummaries.length === 0 ||
      commitOid.length === 0
    ) {
      return null
    }
    const rosterMemberIdByPersonId = new Map<string, string>()
    const matches = analysisResult?.rosterMatches?.matches ?? []
    for (const match of matches) {
      rosterMemberIdByPersonId.set(match.personId, match.memberId)
    }
    const rosterPopulated =
      (analysisContext.course?.roster?.students.length ?? 0) +
        (analysisContext.course?.roster?.staff.length ?? 0) >
      0
    const rosterWarningBySubjectId = new Map<string, string | null>()
    const subjects: SourceSubject[] = authorSummaries.map((summary) => {
      const display = authorDisplays.get(summary.personId) ?? {
        name: summary.canonicalName,
        email: summary.canonicalEmail,
      }
      const rosterMemberId =
        rosterMemberIdByPersonId.get(summary.personId) ?? null
      rosterWarningBySubjectId.set(
        summary.personId,
        shouldShowUnmatchedRosterWarning({
          analysisKind: analysisContext.kind,
          rosterPopulated,
          rosterMemberId,
        })
          ? "This author is not in the course roster; verify they belong to this course before sharing the questions."
          : null,
      )
      return {
        id: summary.personId,
        name: display.name,
        email: display.email,
        lines: summary.lines,
        linesPercent: summary.linesPercent,
      }
    })
    return {
      kind: "course",
      selectedRepoPath,
      commitOid,
      subjects,
      localIdentityContext: buildExaminationLocalIdentityContext({
        personDb: blameResult.personDbOverlay,
        roster: analysisContext.course?.roster ?? null,
      }),
      rosterWarningBySubjectId,
    }
  }, [
    analysisContext.course?.roster,
    analysisContext.kind,
    analysisResult,
    authorDisplays,
    authorSummaries,
    blameResult,
    commitOid,
    selectedRepoPath,
  ])

  if (source === null) {
    return (
      <div className="h-full overflow-auto p-6">
        <EmptyState message={emptyStateMessage ?? ""} />
      </div>
    )
  }

  return (
    <CourseExaminationPane source={source} emptyMessage={emptyStateMessage} />
  )
}

function CourseExaminationPane({
  source,
  emptyMessage,
}: {
  source: CourseExaminationSource
  emptyMessage: string | null
}) {
  const engine = useExaminationEngine({
    source,
    emptyBlocker: emptyMessage,
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Examination</h2>
          <p className="text-sm text-muted-foreground">
            Generate oral exam questions from the code each author signed their
            name to in the final repository state.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={engine.commands.importArchive}
          >
            Import archive...
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={engine.commands.exportArchive}
          >
            Export archive...
          </Button>
        </div>
      </div>

      <LlmControls
        connections={engine.connections}
        activeConnection={engine.activeConnection}
        selectedModelCode={engine.selectedModelCode}
        onSelectConnection={engine.commands.selectConnection}
        onSelectModelCode={engine.commands.selectModelCode}
        onOpenSettings={engine.commands.openLlmSettings}
      />
      <div className="grid grid-cols-[280px_1fr] gap-4 min-h-0 flex-1 overflow-hidden">
        <SubjectList
          subjects={engine.subjects}
          generatedQuestionCountBySubjectId={
            engine.generatedQuestionCountBySubjectId
          }
          selectedSubjectId={engine.selectedSubject?.id ?? null}
          onSelect={engine.commands.selectSubject}
        />
        <div className="h-full min-h-0 overflow-hidden">
          {engine.selectedSubject === null ? (
            <EmptyState message={emptyMessage ?? ""} />
          ) : (
            <SubjectPanel
              subject={engine.selectedSubject}
              display={engine.display}
              archiveEntries={engine.archiveEntries}
              showArchiveSelector={engine.showArchiveSelector}
              questionCount={engine.questionCount}
              showAnswers={engine.showAnswers}
              blocker={engine.blocker}
              rosterWarning={engine.rosterWarning}
              layout="pane"
              emptyMessage="Click Generate to produce questions for this author."
              onQuestionCountChange={engine.commands.changeQuestionCount}
              onShowAnswersChange={engine.commands.changeShowAnswers}
              onSelectArchiveEntry={engine.commands.selectArchiveEntry}
              onGenerate={engine.commands.generate}
              onStopGeneration={engine.commands.stopGeneration}
              onRegenerate={engine.commands.regenerate}
              onCopyMarkdown={engine.commands.copyMarkdown}
            />
          )}
        </div>
      </div>
    </div>
  )
}
