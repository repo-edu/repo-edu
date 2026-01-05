/**
 * CoverageReportSheet - Shows student distribution across assignments
 */

import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@repo-edu/ui"
import { useEffect, useState } from "react"
import { commands } from "../../bindings/commands"
import type { CoverageExportFormat, CoverageReport } from "../../bindings/types"
import { useOutputStore } from "../../stores/outputStore"
import { useRosterStore } from "../../stores/rosterStore"
import { useUiStore } from "../../stores/uiStore"

export function CoverageReportSheet() {
  const coverageReportOpen = useUiStore((state) => state.coverageReportOpen)
  const setCoverageReportOpen = useUiStore(
    (state) => state.setCoverageReportOpen,
  )
  const roster = useRosterStore((state) => state.roster)
  const appendOutput = useOutputStore((state) => state.appendText)

  const [report, setReport] = useState<CoverageReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [exportFormat, setExportFormat] = useState<CoverageExportFormat>("csv")

  useEffect(() => {
    if (coverageReportOpen && roster) {
      setLoading(true)
      commands
        .getRosterCoverage(roster)
        .then((result) => {
          if (result.status === "ok") {
            setReport(result.data)
          } else {
            appendOutput(
              `Failed to load coverage: ${result.error.message}`,
              "error",
            )
          }
        })
        .finally(() => setLoading(false))
    } else {
      setReport(null)
    }
  }, [coverageReportOpen, roster, appendOutput])

  const handleExport = async () => {
    if (!roster) return

    try {
      // Use Tauri dialog to select save path
      const { save } = await import("@tauri-apps/plugin-dialog")
      const path = await save({
        defaultPath: `coverage.${exportFormat}`,
        filters: [
          {
            name: exportFormat === "csv" ? "CSV files" : "Excel files",
            extensions: [exportFormat],
          },
        ],
      })

      if (!path) return

      const result = await commands.exportRosterCoverage(
        roster,
        path,
        exportFormat,
      )
      if (result.status === "ok") {
        appendOutput(`Coverage exported to ${path}`, "success")
      } else {
        appendOutput(`Export failed: ${result.error.message}`, "error")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Export failed: ${message}`, "error")
    }
  }

  return (
    <Sheet open={coverageReportOpen} onOpenChange={setCoverageReportOpen}>
      <SheetContent className="w-full sm:max-w-xl bg-background">
        <SheetHeader>
          <SheetTitle>Roster Coverage</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-4">
          {loading && (
            <div className="text-sm text-muted-foreground">Loading...</div>
          )}

          {report && (
            <>
              <div className="text-sm font-medium text-foreground">
                {report.total_students} students in roster
              </div>

              {/* Assignment coverage table */}
              <div className="border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2 font-medium text-foreground">
                        Assignment
                      </th>
                      <th className="text-left p-2 font-medium text-foreground">
                        Students
                      </th>
                      <th className="text-left p-2 font-medium text-foreground">
                        Missing
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.assignments.map((assignment) => (
                      <tr key={assignment.assignment_id} className="border-t">
                        <td className="p-2 text-foreground">
                          {assignment.assignment_name}
                        </td>
                        <td className="p-2 text-foreground">
                          {assignment.student_count}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {assignment.missing_students.length > 0
                            ? assignment.missing_students.length <= 3
                              ? assignment.missing_students
                                  .map((s) => s.name)
                                  .join(", ")
                              : `${assignment.missing_students.length} not in this assignment`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                    {report.assignments.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="p-4 text-center text-muted-foreground"
                        >
                          No assignments
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Warnings */}
              {report.students_in_multiple.length > 0 && (
                <div className="p-3 bg-warning-muted border border-warning/30 rounded text-sm">
                  <div className="font-medium text-warning">
                    ⚠ Students in multiple assignments:{" "}
                    {report.students_in_multiple.length}
                  </div>
                  <ul className="mt-1 text-warning/80">
                    {report.students_in_multiple.slice(0, 5).map((entry) => (
                      <li key={entry.student.id}>
                        {entry.student.name} (
                        {entry.assignment_names.join(", ")})
                      </li>
                    ))}
                    {report.students_in_multiple.length > 5 && (
                      <li>
                        ...and {report.students_in_multiple.length - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {report.students_in_none.length > 0 && (
                <div className="p-3 bg-warning-muted border border-warning/30 rounded text-sm">
                  <div className="font-medium text-warning">
                    ⚠ Students in no assignment:{" "}
                    {report.students_in_none.length}
                  </div>
                  <ul className="mt-1 text-warning/80">
                    {report.students_in_none.slice(0, 5).map((student) => (
                      <li key={student.id}>{student.name}</li>
                    ))}
                    {report.students_in_none.length > 5 && (
                      <li>...and {report.students_in_none.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Export */}
              <div className="flex items-center gap-4 pt-4 border-t">
                <span className="text-sm text-foreground">Export format:</span>
                <label className="flex items-center gap-1 text-sm text-foreground">
                  <input
                    type="radio"
                    name="exportFormat"
                    checked={exportFormat === "csv"}
                    onChange={() => setExportFormat("csv")}
                  />
                  CSV
                </label>
                <label className="flex items-center gap-1 text-sm text-foreground">
                  <input
                    type="radio"
                    name="exportFormat"
                    checked={exportFormat === "xlsx"}
                    onChange={() => setExportFormat("xlsx")}
                  />
                  XLSX
                </label>
                <Button size="sm" onClick={handleExport}>
                  Export
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
