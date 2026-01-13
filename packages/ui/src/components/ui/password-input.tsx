import type { VariantProps } from "class-variance-authority"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { useState } from "react"

import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Input, type inputVariants } from "./input"

interface PasswordInputProps
  extends Omit<React.ComponentProps<"input">, "type" | "size">,
    VariantProps<typeof inputVariants> {}

/**
 * PasswordInput is an Input with a visibility toggle button.
 * Internally manages show/hide state.
 *
 * @example
 * <PasswordInput
 *   id="api-token"
 *   value={token}
 *   onChange={(e) => setToken(e.target.value)}
 *   title="API access token"
 * />
 */
function PasswordInput({ className, size, ...props }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="relative">
      <Input
        type={showPassword ? "text" : "password"}
        size={size}
        className={cn("pr-10", className)}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-0 top-0 h-full px-3"
        onClick={() => setShowPassword(!showPassword)}
        title={showPassword ? "Hide" : "Show"}
      >
        {showPassword ? (
          <EyeOffIcon className="size-4" />
        ) : (
          <EyeIcon className="size-4" />
        )}
      </Button>
    </div>
  )
}

export { PasswordInput }
export type { PasswordInputProps }
