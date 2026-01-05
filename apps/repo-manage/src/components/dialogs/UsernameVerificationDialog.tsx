/**
 * UsernameVerificationDialog - Verify git usernames against the platform
 *
 * Checks whether git usernames actually exist on the configured platform
 * (GitHub, GitLab, Gitea). Updates student status to valid/invalid.
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo-edu/ui"
import { useState } from "react"
import { commands } from "../../bindings/commands"
import type { UsernameVerificationScope } from "../../bindings/types"
import { useOutputStore } from "../../stores/outputStore"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"

export function UsernameVerificationDialog() {
  const usernameVerificationDialogOpen = useUiStore(
    (state) => state.usernameVerificationDialogOpen,
  )
  const setUsernameVerificationDialogOpen = useUiStore(
    (state) => state.setUsernameVerificationDialogOpen,
  )
  const usernameVerificationResult = useUiStore(
    (state) => state.usernameVerificationResult,
  )
  const setUsernameVerificationResult = useUiStore(
    (state) => state.setUsernameVerificationResult,
  )
  const activeProfile = useUiStore((state) => state.activeProfile)

  const roster = useRosterStore((state) => state.roster)
  const setRoster = useRosterStore((state) => state.setRoster)

  const appendOutput = useOutputStore((state) => state.appendText)

  const [verifying, setVerifying] = useState(false)
  const [scope, setScope] = useState<UsernameVerificationScope>("unknown_only")

  const handleVerify = async () => {
    if (!activeProfile || !roster) return

    setVerifying(true)
    appendOutput(`Verifying git usernames (${scope})...`, "info")

    try {
      const result = await commands.verifyGitUsernames(
        activeProfile,
        roster,
        scope,
      )

      if (result.status === "error") {
        appendOutput(`Verification failed: ${result.error.message}`, "error")
        return
      }

      const { roster: newRoster, verification } = result.data
      setRoster(newRoster)
      setUsernameVerificationResult(verification)

      const { valid, invalid, errors } = verification
      let message = `Verified: ${valid} valid`
      if (invalid.length > 0) {
        message += `, ${invalid.length} invalid`
      }
      if (errors.length > 0) {
        message += `, ${errors.length} errors`
      }
      appendOutput(
        message,
        invalid.length > 0 || errors.length > 0 ? "warning" : "success",
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Verification failed: ${message}`, "error")
    } finally {
      setVerifying(false)
    }
  }

  const handleClose = () => {
    setUsernameVerificationDialogOpen(false)
    setUsernameVerificationResult(null)
  }

  const hasStudents = roster && roster.students.length > 0
  const studentsWithUsernames =
    roster?.students.filter((s) => s.git_username) ?? []

  return (
    <Dialog
      open={usernameVerificationDialogOpen}
      onOpenChange={setUsernameVerificationDialogOpen}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Verify Git Usernames</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {!hasStudents ? (
            <p className="text-sm text-muted-foreground">
              Import students first before verifying git usernames.
            </p>
          ) : studentsWithUsernames.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No students have git usernames. Import usernames first.
            </p>
          ) : usernameVerificationResult ? (
            // Show results
            <div className="text-sm space-y-2">
              <p className="text-success">
                ✓ {usernameVerificationResult.valid} valid
              </p>

              {usernameVerificationResult.invalid.length > 0 && (
                <div>
                  <p className="text-destructive">
                    ✗ {usernameVerificationResult.invalid.length} invalid
                  </p>
                  <ul className="mt-1 ml-4 text-muted-foreground max-h-32 overflow-auto">
                    {usernameVerificationResult.invalid.map((inv) => (
                      <li key={inv.student_email}>
                        {inv.student_name} ({inv.git_username}):{" "}
                        {inv.reason === "not_found" ? "not found" : "blocked"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {usernameVerificationResult.errors.length > 0 && (
                <div>
                  <p className="text-warning">
                    ⚠ {usernameVerificationResult.errors.length} errors
                  </p>
                  <ul className="mt-1 ml-4 text-muted-foreground max-h-32 overflow-auto">
                    {usernameVerificationResult.errors.map((err) => (
                      <li key={err.student_email}>
                        {err.student_name} ({err.git_username}): {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            // Show options
            <>
              <p className="text-sm text-muted-foreground">
                Check if git usernames exist on the configured platform.
              </p>

              <div className="text-sm space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === "unknown_only"}
                    onChange={() => setScope("unknown_only")}
                  />
                  Only unverified (faster)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === "all"}
                    onChange={() => setScope("all")}
                  />
                  All usernames (re-check everything)
                </label>
              </div>

              <p className="text-sm text-muted-foreground">
                {studentsWithUsernames.length} students with git usernames
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          {usernameVerificationResult ? (
            <Button onClick={handleClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleVerify}
                disabled={verifying || studentsWithUsernames.length === 0}
              >
                {verifying ? "Verifying..." : "Verify"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
