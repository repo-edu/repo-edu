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
import { useCallback, useMemo } from "react"

const knownSegments = ["assignment", "group", "surnames"] as const
type SegmentId = (typeof knownSegments)[number]

const segmentLabels: Record<SegmentId, string> = {
  assignment: "assignment",
  group: "group",
  surnames: "members",
}

type SegmentState = {
  id: SegmentId
  enabled: boolean
}

type RepoNameTemplateBuilderProps = {
  template: string
  onTemplateChange: (template: string) => void
  disabled: boolean
}

function parseTemplate(template: string): SegmentState[] {
  // Extract placeholders in order
  const placeholderPattern = /\{(assignment|group|surnames)\}/g
  const found: SegmentId[] = []
  let match = placeholderPattern.exec(template)
  while (match !== null) {
    const id = match[1] as SegmentId
    if (!found.includes(id)) found.push(id)
    match = placeholderPattern.exec(template)
  }

  // Build segments: found ones enabled, missing ones disabled at end
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
}: RepoNameTemplateBuilderProps) {
  const segments = useMemo(() => parseTemplate(template), [template])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = segments.findIndex((s) => s.id === active.id)
      const newIndex = segments.findIndex((s) => s.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const next = [...segments]
      const [moved] = next.splice(oldIndex, 1)
      next.splice(newIndex, 0, moved)
      onTemplateChange(buildTemplate(next))
    },
    [segments, onTemplateChange],
  )

  const toggleSegment = useCallback(
    (id: SegmentId) => {
      const next = segments.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      )
      onTemplateChange(buildTemplate(next))
    },
    [segments, onTemplateChange],
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
