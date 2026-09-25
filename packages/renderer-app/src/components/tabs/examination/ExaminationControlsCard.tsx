import {
  EXAMINATION_QUESTION_COUNT_MAX,
  EXAMINATION_QUESTION_COUNT_MIN,
} from "@repo-edu/application-contract"
import {
  Button,
  Card,
  CardContent,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import { sessionCancellationControl } from "../../../session/session-controller-context.js"

const questionCounts = Array.from(
  {
    length: EXAMINATION_QUESTION_COUNT_MAX - EXAMINATION_QUESTION_COUNT_MIN + 1,
  },
  (_, index) => EXAMINATION_QUESTION_COUNT_MIN + index,
)

type ExaminationControlsCardProps = {
  questionCount: number
  showAnswers: boolean
  blocker: string | null
  hasLoadedQuestions: boolean
  onLoadQuestions: () => void
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
  hasLoadedQuestions,
  onLoadQuestions,
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
            <Select
              value={String(questionCount)}
              disabled={isGenerating}
              onValueChange={(value) => onQuestionCountChange(Number(value))}
            >
              <SelectTrigger id="examination-question-count" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {questionCounts.map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {count}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={onLoadQuestions}
            disabled={isGenerating || blocker !== null}
          >
            {hasLoadedQuestions ? "Refresh questions" : "Load questions"}
          </Button>
          <Button
            {...(isGenerating
              ? {
                  [sessionCancellationControl]: "examination.generateQuestions",
                }
              : {})}
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
