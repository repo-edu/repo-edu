import { useEffect, useRef, useState } from "react"
import type { ExaminationEntry } from "../../../stores/examination-store-types.js"
import { InProgressQuestionCard, StreamPreviewCard } from "./QuestionList.js"

export function StreamingGenerationDetail({
  entry,
  index,
  requestedQuestionCount,
  showAnswers,
}: {
  entry: ExaminationEntry
  index: number
  requestedQuestionCount: number
  showAnswers: boolean
}) {
  const topRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" })
  })

  return (
    <div ref={topRef} className="flex flex-col gap-2">
      <GenerationProgress
        entry={entry}
        requestedQuestionCount={requestedQuestionCount}
      />
      {entry.inProgressQuestion !== null ? (
        <InProgressQuestionCard
          index={index}
          inProgress={entry.inProgressQuestion}
          showAnswers={showAnswers}
        />
      ) : (
        <StreamPreviewCard preview={entry.streamedResponsePreview} />
      )}
    </div>
  )
}

function streamingQuestionCaption(
  acceptedCount: number,
  requestedCount: number,
): string {
  if (acceptedCount >= requestedCount) {
    return "Finalising questions..."
  }
  return `Generating question ${acceptedCount + 1} of ${requestedCount}...`
}

function GenerationProgress({
  entry,
  requestedQuestionCount,
}: {
  entry: ExaminationEntry
  requestedQuestionCount: number
}) {
  const acceptedCount = entry.questions.length
  const elapsedSeconds = useGenerationElapsedSeconds(entry.status === "loading")
  const hasStreamedResponse = entry.streamedResponseCharacterCount > 0
  const progressLabel =
    entry.generationProgressLabel ??
    (hasStreamedResponse
      ? "Receiving model response."
      : "Waiting for LLM response.")
  const waitingLabel = `No response text yet. ${formatElapsedSeconds(
    elapsedSeconds,
  )} elapsed.`
  const countLabel =
    acceptedCount === 0
      ? hasStreamedResponse
        ? "Streaming response text."
        : waitingLabel
      : `${acceptedCount} of ${requestedQuestionCount} questions ready.`
  return (
    <div className="rounded border bg-muted/20 px-3 py-2">
      <div className="text-xs font-medium">{progressLabel}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {streamingQuestionCaption(acceptedCount, requestedQuestionCount)}{" "}
        {countLabel}
      </div>
    </div>
  )
}

function useGenerationElapsedSeconds(active: boolean): number {
  const [startedAtMs, setStartedAtMs] = useState(() => Date.now())
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    const startedAt = Date.now()
    setStartedAtMs(startedAt)
    setNowMs(startedAt)
    const interval = globalThis.setInterval(() => setNowMs(Date.now()), 1_000)
    return () => globalThis.clearInterval(interval)
  }, [active])

  if (!active) return 0
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000))
}

function formatElapsedSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${remainder}s`
}
