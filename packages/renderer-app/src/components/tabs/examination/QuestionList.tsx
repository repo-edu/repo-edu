import type {
  ExaminationQuestion,
  ExaminationSourceReference,
} from "@repo-edu/application-contract"
import { formatQuestionReference } from "./question-format.js"

type QuestionListProps = {
  questions: ExaminationQuestion[]
  sourceReferences: ExaminationSourceReference[]
  showAnswers: boolean
}

export function QuestionList({
  questions,
  sourceReferences,
  showAnswers,
}: QuestionListProps) {
  return (
    <ol className="flex flex-col gap-3">
      {questions.map((question, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: questions are generated once per render batch and index is stable for that batch
          key={index}
          className="rounded border p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium">
                {index + 1}. {question.question}
              </div>
              {formatQuestionReference(question, sourceReferences) !== null ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatQuestionReference(question, sourceReferences)}
                </div>
              ) : null}
            </div>
          </div>
          {showAnswers ? (
            <div className="mt-2 whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Answer
              </span>
              <div>{question.answer}</div>
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
