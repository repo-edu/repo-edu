/**
 * CoverageReportSheet - Shows student distribution across assignments
 */

import type {
  CoverageExportFormat,
  CoverageReport,
} from "@repo-edu/backend-interface/types"
import {
  Alert,
  Button,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmptyRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@repo-edu/ui"
import { useEffect, useState } from "react"
import { commands } from "../../bindings/commands"
import { saveDialog } from "../../services/platform"
import { useOutputStore } from "../../stores/outputStore"
import { useProfileStore } from "../../stores/profileStore"
import { useUiStore } from "../../stores/uiStore"
import { StyledRadioGroup } from "../StyledRadioGroup"

export function CoverageReportSheet() {
  const coverageReportOpen = useUiStore((state) => state.coverageReportOpen)
  const setCoverageReportOpen = useUiStore(
    (state) => state.setCoverageReportOpen,
  )
  const roster = useProfileStore((state) => state.document?.roster ?? null)
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
      const path = await saveDialog({
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
      <SheetContent className="w-full sm:max-w-xl bg-background pl-5">
        <SheetHeader>
          <SheetTitle>Roster Coverage</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-4">
          {loading && <div>Loading...</div>}

          {report && (
            <>
              <div className="font-medium">
                {report.total_students} students in roster
              </div>

              {/* Assignment coverage table */}
              <DataTable>
                <DataTableHeader>
                  <DataTableHead>Assignment</DataTableHead>
                  <DataTableHead>Students</DataTableHead>
                  <DataTableHead>Missing</DataTableHead>
                </DataTableHeader>
                <DataTableBody>
                  {report.assignments.map((assignment) => (
                    <DataTableRow key={assignment.assignment_id}>
                      <DataTableCell>
                        {assignment.assignment_name}
                      </DataTableCell>
                      <DataTableCell>{assignment.student_count}</DataTableCell>
                      <DataTableCell>
                        {assignment.missing_students.length > 0
                          ? assignment.missing_students.length <= 3
                            ? assignment.missing_students
                                .map((s) => s.name)
                                .join(", ")
                            : `${assignment.missing_students.length} not in this assignment`
                          : "—"}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                  {report.assignments.length === 0 && (
                    <DataTableEmptyRow colSpan={3} message="No assignments" />
                  )}
                </DataTableBody>
              </DataTable>

              {/* Warning: students not in any assignment */}
              {report.students_in_none.length > 0 && (
                <Alert variant="warning">
                  <div className="font-medium">
                    Students in no assignment: {report.students_in_none.length}
                  </div>
                  <ul className="mt-1">
                    {report.students_in_none.slice(0, 5).map((student) => (
                      <li key={student.id}>{student.name}</li>
                    ))}
                    {report.students_in_none.length > 5 && (
                      <li>...and {report.students_in_none.length - 5} more</li>
                    )}
                  </ul>
                </Alert>
              )}

              {/* Export */}
              <div
                className="flex items-center gap-4 pt-4 border-t"
                title="Export assignment coverage showing which students are in which assignments."
              >
                <span className="text-sm">Export format:</span>
                <StyledRadioGroup
                  value={exportFormat}
                  onValueChange={(v) =>
                    setExportFormat(v as CoverageExportFormat)
                  }
                  name="export-format"
                  options={[
                    { value: "csv", label: "CSV" },
                    { value: "xlsx", label: "XLSX" },
                  ]}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExport}
                  title="Export assignment coverage showing which students are in which assignments."
                >
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
