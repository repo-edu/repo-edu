import { cva, type VariantProps } from "class-variance-authority"
import { XIcon } from "lucide-react"
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useState,
} from "react"

import { cn } from "../../lib/utils"

const tagInputVariants = cva(
  "border-input flex flex-wrap items-center gap-1 rounded-md border bg-transparent px-1.5 py-1 shadow-xs transition-[color,box-shadow] outline-none focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
  {
    variants: {
      size: {
        default: "min-h-9 text-sm",
        sm: "min-h-8 text-sm",
        xs: "min-h-6 text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
)

const tagChipVariants = cva(
  "inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-foreground",
  {
    variants: {
      size: {
        default: "text-xs leading-none h-6",
        sm: "text-xs leading-none h-5",
        xs: "text-[11px] leading-none h-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
)

const SPLIT_KEYS = new Set(["Enter", ","])
const SPLIT_REGEX = /[\s,]+/

export type TagRenderProps = {
  value: string
  index: number
  remove: () => void
}

interface TagInputProps extends VariantProps<typeof tagInputVariants> {
  id?: string
  className?: string
  values: readonly string[]
  onChange: (next: string[]) => void
  placeholder?: string
  /**
   * Normalise each candidate token before insertion. Return `null` to reject
   * the token. Defaults to a trim/lowercase pass.
   */
  normalize?: (raw: string) => string | null
  /**
   * Custom chip renderer. Receives the value, its index, and a `remove` action.
   * If omitted, a default chip with an X button is rendered.
   */
  renderTag?: (props: TagRenderProps) => ReactNode
  ariaLabel?: string
  disabled?: boolean
}

const defaultNormalize = (raw: string): string | null => {
  const trimmed = raw.trim().toLowerCase()
  return trimmed.length === 0 ? null : trimmed
}

function TagInput({
  id,
  className,
  size,
  values,
  onChange,
  placeholder,
  normalize = defaultNormalize,
  renderTag,
  ariaLabel,
  disabled,
}: TagInputProps) {
  const reactId = useId()
  const inputId = id ?? `tag-input-${reactId}`
  const [draft, setDraft] = useState("")

  const addTokens = useCallback(
    (raw: string) => {
      const tokens = raw.split(SPLIT_REGEX)
      const next = [...values]
      const seen = new Set(next)
      for (const token of tokens) {
        const norm = normalize(token)
        if (norm === null) continue
        if (seen.has(norm)) continue
        seen.add(norm)
        next.push(norm)
      }
      if (next.length !== values.length) onChange(next)
    },
    [values, normalize, onChange],
  )

  const removeAt = useCallback(
    (index: number) => {
      const next = values.filter((_, i) => i !== index)
      onChange(next)
    },
    [values, onChange],
  )

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (SPLIT_KEYS.has(e.key)) {
      if (draft.trim().length > 0) {
        e.preventDefault()
        addTokens(draft)
        setDraft("")
      } else if (e.key === "Enter") {
        e.preventDefault()
      }
      return
    }
    if (e.key === "Backspace" && draft.length === 0 && values.length > 0) {
      e.preventDefault()
      removeAt(values.length - 1)
    }
  }

  return (
    <label
      htmlFor={inputId}
      className={cn(tagInputVariants({ size }), className)}
    >
      {values.map((value, index) => {
        const remove = () => removeAt(index)
        if (renderTag) {
          return <span key={value}>{renderTag({ value, index, remove })}</span>
        }
        return (
          <span key={value} className={tagChipVariants({ size })}>
            <span>{value}</span>
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={(e) => {
                e.stopPropagation()
                remove()
              }}
              className="text-muted-foreground hover:text-foreground"
              disabled={disabled}
            >
              <XIcon className="size-3" />
            </button>
          </span>
        )
      })}
      <input
        id={inputId}
        type="text"
        aria-label={ariaLabel}
        value={draft}
        placeholder={values.length === 0 ? placeholder : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (draft.trim().length > 0) {
            addTokens(draft)
            setDraft("")
          }
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text")
          if (SPLIT_REGEX.test(text)) {
            e.preventDefault()
            addTokens(draft + text)
            setDraft("")
          }
        }}
        disabled={disabled}
        className="flex-1 min-w-[6ch] bg-transparent outline-none placeholder:[color:var(--placeholder)] placeholder:italic placeholder:font-normal"
      />
    </label>
  )
}

export type { TagInputProps }
export { TagInput, tagChipVariants, tagInputVariants }
