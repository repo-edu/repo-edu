import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from "@repo-edu/ui"
import { useMemo } from "react"
import { selectStudents, useCourseStore } from "../../stores/course-store.js"
import { useUiStore } from "../../stores/ui-store.js"

export function UsernameVerificationDialog() {
  const open = useUiStore((state) => state.usernameVerificationDialogOpen)
  const setOpen = useUiStore((state) => state.setUsernameVerificationDialogOpen)
  const setImportGitUsernamesDialogOpen = useUiStore(
    (state) => state.setImportGitUsernamesDialogOpen,
  )

  const students = useCourseStore(selectStudents)

  const summary = useMemo(() => {
    let valid = 0
    let invalid = 0
    let unknown = 0
    let missing = 0

    for (const student of students) {
      if (!student.gitUsername || student.gitUsername.trim().length === 0) {
        missing += 1
        continue
      }
      if (student.gitUsernameStatus === "valid") {
        valid += 1
        continue
      }
      if (student.gitUsernameStatus === "invalid") {
        invalid += 1
        continue
      }
      unknown += 1
    }

    return { valid, invalid, unknown, missing }
  }, [students])

  const handleClose = () => {
    setOpen(false)
  }

  const handleOpenImport = () => {
    setOpen(false)
    setImportGitUsernamesDialogOpen(true)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Git Username Verification</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Text className="text-sm text-muted-foreground">
            Username verification is performed as part of Git username import in
            the current workflow surface.
          </Text>
          <div className="rounded-md border px-3 py-2 text-sm space-y-1">
            <div>{summary.valid} valid</div>
            <div>{summary.invalid} invalid</div>
            <div>{summary.unknown} unknown</div>
            <div>{summary.missing} missing username</div>
          </div>
          <Text className="text-xs text-muted-foreground">
            Re-import a username CSV to refresh verification status.
          </Text>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button onClick={handleOpenImport}>Open Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
