import type * as React from "react"

import { cn } from "../../lib/utils"
import { Label } from "./label"

interface FormFieldProps {
  label: React.ReactNode
  htmlFor?: string
  description?: string
  title?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}

function FormField({
  label,
  htmlFor,
  description,
  title,
  required,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor} title={title}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

export type { FormFieldProps }
export { FormField }
