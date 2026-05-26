import type {
  ExaminationInProgressQuestion,
  ExaminationQuestion,
  ExaminationSourceReference,
} from "@repo-edu/application-contract"
import { useEffect, useRef } from "react"
import { formatQuestionReference } from "./question-format.js"

type QuestionListProps = {
  questions: ExaminationQuestion[]
  sourceReferences: ExaminationSourceReference[]
  showAnswers: boolean
}

export function InProgressQuestionCard({
  index,
  inProgress,
  showAnswers,
}: {
  index: number
  inProgress: ExaminationInProgressQuestion
  showAnswers: boolean
}) {
  const hasQuestion = inProgress.question.length > 0
  const hasAnswer = inProgress.answer.length > 0
  return (
    <div className="rounded border border-dashed p-3 text-muted-foreground">
      <div className="text-sm font-medium">
        {index + 1}.{" "}
        {hasQuestion ? (
          <span className="whitespace-pre-wrap">{inProgress.question}</span>
        ) : (
          <span className="italic">Streaming...</span>
        )}
      </div>
      {showAnswers && hasAnswer ? (
        <div className="mt-2 whitespace-pre-wrap rounded bg-muted/30 p-2 text-sm">
          <span className="text-xs font-semibold uppercase">Answer</span>
          <div>{inProgress.answer}</div>
        </div>
      ) : null}
    </div>
  )
}

export function StreamPreviewCard({ preview }: { preview: string }) {
  const previewRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const previewElement = previewRef.current
    if (previewElement === null) return
    previewElement.scrollTop = previewElement.scrollHeight
  })

  if (preview.trim().length === 0) return null
  return (
    <pre
      ref={previewRef}
      className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-dashed bg-muted/20 p-3 font-mono text-xs text-muted-foreground"
    >
      {preview}
    </pre>
  )
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
