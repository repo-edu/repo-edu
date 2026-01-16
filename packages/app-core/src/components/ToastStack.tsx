import { cn } from "@repo-edu/ui"
import { useEffect } from "react"
import { useToastStore } from "../stores/toastStore"

const toneClasses = {
  info: "border-border bg-card text-foreground",
  success: "border-success/40 bg-success/10 text-foreground",
  warning: "border-warning/40 bg-warning-muted text-foreground",
  error: "border-destructive/40 bg-destructive/10 text-foreground",
}

export function ToastStack() {
  const toasts = useToastStore((state) => state.toasts)
  const removeToast = useToastStore((state) => state.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} onClose={removeToast} {...toast} />
      ))}
    </div>
  )
}

interface ToastItemProps {
  id: string
  message: string
  tone: keyof typeof toneClasses
  durationMs: number
  onClose: (id: string) => void
}

function ToastItem({ id, message, tone, durationMs, onClose }: ToastItemProps) {
  useEffect(() => {
    const timeout = setTimeout(() => onClose(id), durationMs)
    return () => clearTimeout(timeout)
  }, [id, durationMs, onClose])

  return (
    <output
      className={cn(
        "rounded-md border px-3 py-2 text-sm shadow-md backdrop-blur",
        toneClasses[tone],
      )}
      aria-live="polite"
    >
      {message}
    </output>
  )
}
