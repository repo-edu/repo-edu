import { useEffect, useRef } from "react";
import { useToastStore, selectToasts } from "../stores/toast-store.js";
import { cn } from "@repo-edu/ui";
import { Button } from "@repo-edu/ui";

export function ToastStack() {
  const toasts = useToastStore(selectToasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          message={toast.message}
          tone={toast.tone}
          durationMs={toast.durationMs}
          actionLabel={toast.action?.label}
          onAction={toast.action?.onClick}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

function ToastItem({
  id,
  message,
  tone,
  durationMs,
  actionLabel,
  onAction,
  onDismiss,
}: {
  id: string;
  message: string;
  tone: string;
  durationMs: number;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, durationMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [durationMs, onDismiss]);

  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3 text-sm shadow-lg",
        "flex items-center gap-3 min-w-[280px] max-w-[400px]",
        tone === "error" && "border-destructive bg-destructive/10 text-destructive",
        tone === "warning" && "border-yellow-500 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300",
        tone === "success" && "border-green-500 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300",
        tone === "info" && "border-border bg-background text-foreground",
      )}
    >
      <span className="flex-1">{message}</span>
      {actionLabel && onAction && (
        <Button variant="ghost" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
