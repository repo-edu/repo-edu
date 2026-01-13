import type * as React from "react"

import { cn } from "../../lib/utils"
import { Label } from "./label"

interface FormFieldProps {
  /** Label text displayed above the input */
  label: string
  /** ID for the input element (passed to htmlFor on Label) */
  htmlFor?: string
  /** Optional description text displayed below the input */
  description?: string
  /** Tooltip text applied to both label and input */
  title?: string
  /** Whether to show a required indicator */
  required?: boolean
  /** The input element(s) */
  children: React.ReactNode
  /** Additional class names for the wrapper */
  className?: string
}

/**
 * FormField wraps a label and input element with consistent spacing.
 *
 * The `title` prop is passed to the Label component and should also be
 * applied to the input element by the consumer for accessibility.
 *
 * @example
 * <FormField label="Email" htmlFor="email" title="Your email address">
 *   <Input id="email" title="Your email address" />
 * </FormField>
 */
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

export { FormField }
export type { FormFieldProps }
