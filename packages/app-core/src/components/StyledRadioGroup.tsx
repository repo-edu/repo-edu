/**
 * StyledRadioGroup - Consistent radio button styling across the app.
 */

import { Label, RadioGroup, RadioGroupItem } from "@repo-edu/ui"

export interface RadioOption {
  value: string
  label: string
  title?: string
}

interface StyledRadioGroupProps {
  value: string
  onValueChange: (value: string) => void
  options: RadioOption[]
  name?: string
  className?: string
}

export function StyledRadioGroup({
  value,
  onValueChange,
  options,
  name,
  className,
}: StyledRadioGroupProps) {
  return (
    <RadioGroup
      value={value}
      onValueChange={onValueChange}
      className={className ?? "flex gap-4"}
      name={name}
    >
      {options.map((option) => (
        <div key={option.value} className="flex items-center gap-1.5">
          <RadioGroupItem
            value={option.value}
            id={`${name ?? "radio"}-${option.value}`}
          />
          <Label
            htmlFor={`${name ?? "radio"}-${option.value}`}
            className="font-normal text-sm"
            title={option.title}
          >
            {option.label}
          </Label>
        </div>
      ))}
    </RadioGroup>
  )
}
