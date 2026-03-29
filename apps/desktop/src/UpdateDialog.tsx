import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo-edu/ui"
import { Download } from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useState } from "react"
import type {
  DesktopRendererHostBridge,
  DownloadProgress,
} from "./renderer-host-bridge"

type DialogPhase =
  | { kind: "closed" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; progress: DownloadProgress | null }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; version: string | null; message: string }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`
}

export function UpdateDialog({
  bridge,
}: {
  bridge: DesktopRendererHostBridge
}) {
  const [phase, setPhase] = useState<DialogPhase>({ kind: "closed" })

  useEffect(() => {
    const unsubAvailable = bridge.onUpdateAvailable(({ version }) => {
      setPhase((prev) => {
        if (prev.kind === "downloading" || prev.kind === "downloaded")
          return prev
        return { kind: "available", version }
      })
    })

    const unsubProgress = bridge.onDownloadProgress((progress) => {
      setPhase((prev) => {
        if (prev.kind !== "downloading") return prev
        return { ...prev, progress }
      })
    })

    const unsubDownloaded = bridge.onUpdateDownloaded(() => {
      setPhase((prev) => {
        if (prev.kind === "downloading" || prev.kind === "available") {
          return { kind: "downloaded", version: prev.version }
        }
        return prev
      })
    })

    const unsubError = bridge.onUpdateError(({ message }) => {
      setPhase((prev) => {
        const version =
          prev.kind !== "closed" && prev.kind !== "error" ? prev.version : null
        return { kind: "error", version, message: message || "Unknown error" }
      })
    })

    return () => {
      unsubAvailable()
      unsubProgress()
      unsubDownloaded()
      unsubError()
    }
  }, [bridge])

  const dismiss = useCallback(() => setPhase({ kind: "closed" }), [])

  const startDownload = useCallback(
    (version: string) => {
      setPhase({ kind: "downloading", version, progress: null })
      void bridge.downloadUpdate().catch(() => {
        setPhase((prev) =>
          prev.kind === "downloading"
            ? {
                kind: "error",
                version: prev.version,
                message: "Download failed",
              }
            : prev,
        )
      })
    },
    [bridge],
  )

  const installAndRestart = useCallback(() => {
    void bridge.quitAndInstall()
  }, [bridge])

  const isOpen = phase.kind !== "closed"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent
        size="compact"
        showCloseButton={phase.kind !== "downloading"}
        onInteractOutside={(e) => {
          if (phase.kind === "downloading") e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (phase.kind === "downloading") e.preventDefault()
        }}
      >
        {phase.kind === "available" && (
          <>
            <DialogHeader size="compact">
              <DialogTitle size="compact">Update Available</DialogTitle>
              <DialogDescription>
                Repo Edu {phase.version} is ready to download.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={dismiss}>
                Later
              </Button>
              <Button size="sm" onClick={() => startDownload(phase.version)}>
                <Download className="size-4" />
                Update Now
              </Button>
            </DialogFooter>
          </>
        )}

        {phase.kind === "downloading" && (
          <>
            <DialogHeader size="compact">
              <DialogTitle size="compact">
                Downloading {phase.version}
              </DialogTitle>
              {phase.progress && (
                <DialogDescription>
                  {formatBytes(phase.progress.transferred)} /{" "}
                  {formatBytes(phase.progress.total)} &middot;{" "}
                  {formatSpeed(phase.progress.bytesPerSecond)}
                </DialogDescription>
              )}
            </DialogHeader>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-[width] duration-300"
                style={{ width: `${phase.progress?.percent ?? 0}%` }}
              />
            </div>
          </>
        )}

        {phase.kind === "downloaded" && (
          <>
            <DialogHeader size="compact">
              <DialogTitle size="compact">Ready to Install</DialogTitle>
              <DialogDescription>
                Repo Edu {phase.version} has been downloaded. Restart to install
                the update.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={dismiss}>
                Later
              </Button>
              <Button size="sm" onClick={installAndRestart}>
                Install and Restart
              </Button>
            </DialogFooter>
          </>
        )}

        {phase.kind === "error" && (
          <>
            <DialogHeader size="compact">
              <DialogTitle size="compact">Update Error</DialogTitle>
              <DialogDescription>{phase.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={dismiss}>
                Dismiss
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
