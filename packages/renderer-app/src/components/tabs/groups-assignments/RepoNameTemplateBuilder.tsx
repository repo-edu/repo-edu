import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@repo-edu/ui"
import { GripHorizontal } from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const knownSegments = ["assignment", "group", "surnames", "members"] as const
type SegmentId = (typeof knownSegments)[number]

const segmentLabels: Record<SegmentId, string> = {
  assignment: "assignment",
  group: "group",
  surnames: "surnames",
  members: "members",
}

type SegmentState = {
  id: SegmentId
  enabled: boolean
}

type RepoNameTemplateBuilderProps = {
  template: string
  onTemplateChange: (template: string) => void
  disabled: boolean
  hiddenSegments?: readonly SegmentId[]
}

function parseTemplate(template: string): SegmentState[] {
  const placeholderPattern = /\{(assignment|group|surnames|members)\}/g
  const found: SegmentId[] = []
  let match = placeholderPattern.exec(template)
  while (match !== null) {
    const id = match[1] as SegmentId
    if (!found.includes(id)) found.push(id)
    match = placeholderPattern.exec(template)
  }

  const segments: SegmentState[] = found.map((id) => ({ id, enabled: true }))
  for (const id of knownSegments) {
    if (!found.includes(id)) {
      segments.push({ id, enabled: false })
    }
  }

  return segments
}

function buildTemplate(segments: SegmentState[]): string {
  return segments
    .filter((s) => s.enabled)
    .map((s) => `{${s.id}}`)
    .join("-")
}

export function RepoNameTemplateBuilder({
  template,
  onTemplateChange,
  disabled,
  hiddenSegments,
}: RepoNameTemplateBuilderProps) {
  const [allSegments, setAllSegments] = useState(() => parseTemplate(template))
  const lastEmittedRef = useRef(template)

  useEffect(() => {
    if (template !== lastEmittedRef.current) {
      setAllSegments(parseTemplate(template))
      lastEmittedRef.current = template
    }
  }, [template])

  const segments = useMemo(
    () =>
      hiddenSegments
        ? allSegments.filter((s) => !hiddenSegments.includes(s.id))
        : allSegments,
    [allSegments, hiddenSegments],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const emit = useCallback(
    (next: SegmentState[]) => {
      const t = buildTemplate(next)
      lastEmittedRef.current = t
      onTemplateChange(t)
    },
    [onTemplateChange],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      setAllSegments((prev) => {
        const oldIndex = prev.findIndex((s) => s.id === active.id)
        const newIndex = prev.findIndex((s) => s.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return prev

        const next = [...prev]
        const [moved] = next.splice(oldIndex, 1)
        next.splice(newIndex, 0, moved)
        emit(next)
        return next
      })
    },
    [emit],
  )

  const toggleSegment = useCallback(
    (id: SegmentId) => {
      setAllSegments((prev) => {
        const next = prev.map((s) =>
          s.id === id ? { ...s, enabled: !s.enabled } : s,
        )
        emit(next)
        return next
      })
    },
    [emit],
  )

  const sortableIds = segments.map((s) => s.id)

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground shrink-0 w-20">
        Repo name:
      </span>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableIds}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex items-center gap-1">
            {segments.map((segment, index) => {
              const prevEnabled = segments
                .slice(0, index)
                .some((s) => s.enabled)
              const showSep = segment.enabled && prevEnabled
              return (
                <div key={segment.id} className="flex items-center">
                  {showSep && (
                    <span className="text-xs text-muted-foreground mx-0.5">
                      -
                    </span>
                  )}
                  <SortableSegmentChip
                    segment={segment}
                    onToggle={() => toggleSegment(segment.id)}
                    disabled={disabled}
                  />
                </div>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function SortableSegmentChip({
  segment,
  onToggle,
  disabled,
}: {
  segment: SegmentState
  onToggle: () => void
  disabled: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: segment.id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs transition-colors select-none",
        segment.enabled
          ? "bg-muted text-foreground"
          : "bg-muted/40 text-muted-foreground/50 line-through",
      )}
      onClick={() => {
        if (!disabled) onToggle()
      }}
      disabled={disabled}
    >
      <GripHorizontal
        className="size-3 shrink-0 cursor-grab text-muted-foreground/50"
        {...attributes}
        {...listeners}
      />
      {segmentLabels[segment.id]}
    </button>
  )
}
