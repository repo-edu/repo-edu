import { Button, Card, CardContent, Input, Label } from "@repo-edu/ui"

type ExaminationControlsCardProps = {
  questionCount: number
  showAnswers: boolean
  blocker: string | null
  isGenerating: boolean
  canRegenerate: boolean
  canToggleAnswers: boolean
  canCopyMarkdown: boolean
  onQuestionCountChange: (count: number) => void
  onShowAnswersChange: (show: boolean) => void
  onGenerate: () => void
  onStopGeneration: () => void
  onRegenerate: () => void
  onCopyMarkdown: () => void
}

export function ExaminationControlsCard({
  questionCount,
  showAnswers,
  blocker,
  isGenerating,
  canRegenerate,
  canToggleAnswers,
  canCopyMarkdown,
  onQuestionCountChange,
  onShowAnswersChange,
  onGenerate,
  onStopGeneration,
  onRegenerate,
  onCopyMarkdown,
}: ExaminationControlsCardProps) {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="examination-question-count">New questions</Label>
            <Input
              id="examination-question-count"
              type="number"
              min={1}
              max={20}
              value={questionCount}
              disabled={isGenerating}
              onChange={(event) =>
                onQuestionCountChange(Number(event.target.value))
              }
              className="w-24"
            />
          </div>
          <Button
            onClick={isGenerating ? onStopGeneration : onGenerate}
            disabled={isGenerating ? false : blocker !== null}
            title={blocker ?? undefined}
          >
            {isGenerating ? "Stop" : "Generate questions"}
          </Button>
          <Button
            variant="outline"
            onClick={onRegenerate}
            disabled={!canRegenerate}
            title={
              blocker ??
              "Force a fresh LLM call, overwriting the archived entry."
            }
          >
            Regenerate
          </Button>
          <Button
            variant="secondary"
            onClick={() => onShowAnswersChange(!showAnswers)}
            disabled={!canToggleAnswers}
          >
            {showAnswers ? "Hide answers" : "Show answers"}
          </Button>
          <Button
            variant="ghost"
            onClick={onCopyMarkdown}
            disabled={!canCopyMarkdown}
          >
            Copy as Markdown
          </Button>
        </div>
        {blocker !== null ? (
          <p className="mt-3 text-xs text-muted-foreground">{blocker}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
