import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import { useState } from "react"
import { useRepoFormStore } from "../stores"
import { FormField } from "./FormField"
import { MdiChevronDown } from "./icons/MdiChevronDown"
import { MdiInformationOutline } from "./icons/MdiInformationOutline"
import { Section } from "./Section"

const LAYOUT_OPTIONS = [
  {
    value: "flat" as const,
    label: "Flat",
    description: "All repositories at the same level",
  },
  {
    value: "by-team" as const,
    label: "By Team",
    description: "Grouped into team subdirectories",
  },
  {
    value: "by-task" as const,
    label: "By Task",
    description: "Grouped into task subdirectories",
  },
]

export function OptionsSection() {
  const repoForm = useRepoFormStore()
  const [open, setOpen] = useState(false)

  const currentOption =
    LAYOUT_OPTIONS.find((opt) => opt.value === repoForm.directoryLayout) ||
    LAYOUT_OPTIONS[0]

  const handleSelect = (value: "by-team" | "flat" | "by-task") => {
    repoForm.setField("directoryLayout", value)
    setOpen(false)
  }

  return (
    <Section id="options" title="Options">
      <FormField
        label="Folder Layout"
        tooltip="How cloned repositories are organized"
      >
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              variant="outline"
              className="justify-between gap-2 w-28"
            >
              <span className="truncate">{currentOption.label}</span>
              <MdiChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            {LAYOUT_OPTIONS.map((option) => (
              <Tooltip key={option.value} delayDuration={300}>
                <TooltipTrigger asChild>
                  <div
                    role="option"
                    tabIndex={0}
                    aria-selected={option.value === repoForm.directoryLayout}
                    onClick={() => handleSelect(option.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleSelect(option.value)
                      }
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-sm cursor-pointer",
                      "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
                      option.value === repoForm.directoryLayout &&
                        "bg-blue-100 dark:bg-blue-700/60 font-medium",
                    )}
                  >
                    <MdiInformationOutline
                      className="size-3.5 text-muted-foreground shrink-0"
                      title=""
                    />
                    {option.label}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {option.description}
                </TooltipContent>
              </Tooltip>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </FormField>
    </Section>
  )
}
