import {
  isSupportedExtension,
  normalizeExtension,
} from "@repo-edu/domain/analysis"
import {
  TagInput,
  type TagInputProps,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import { Info, X } from "@repo-edu/ui/components/icons"
import { extensionToShikiLang } from "../../utils/blame-language-map.js"

type SupportTier = "full" | "no-comments" | "no-colorization" | "none"

function classifySupport(ext: string): SupportTier {
  const hasComments = isSupportedExtension(ext)
  const hasColor = extensionToShikiLang(ext) !== null
  if (hasComments && hasColor) return "full"
  if (!hasComments && !hasColor) return "none"
  if (!hasComments) return "no-comments"
  return "no-colorization"
}

const SUPPORT_HINT: Record<Exclude<SupportTier, "full">, string> = {
  "no-comments":
    "Counts every line as code. Comment lines aren't excluded from blame totals.",
  "no-colorization": "Comment detection works, but no syntax colorization.",
  none: "Counts every line as code; no syntax colorization.",
}

const normalize = (raw: string): string | null => {
  const norm = normalizeExtension(raw)
  return norm.length === 0 ? null : norm
}

interface Props {
  id?: string
  className?: string
  size?: TagInputProps["size"]
  values: readonly string[]
  onChange: (next: string[]) => void
  placeholder?: string
  ariaLabel?: string
}

export function ExtensionTagInput({
  id,
  className,
  size,
  values,
  onChange,
  placeholder,
  ariaLabel,
}: Props) {
  return (
    <TagInput
      id={id}
      className={className}
      size={size}
      values={values}
      onChange={onChange}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      normalize={normalize}
      renderTag={({ value, remove }) => {
        const tier = classifySupport(value)
        const hint = tier === "full" ? null : SUPPORT_HINT[tier]
        const chip = (
          <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs leading-none h-6 text-foreground">
            <span>{value}</span>
            {hint !== null && (
              <Info className="size-3 text-muted-foreground" aria-hidden />
            )}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={(e) => {
                e.stopPropagation()
                remove()
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        )
        if (hint === null) return chip
        return (
          <Tooltip>
            <TooltipTrigger asChild>{chip}</TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        )
      }}
    />
  )
}
