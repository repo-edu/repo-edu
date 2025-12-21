import {
  Button,
  cn,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import { useState } from "react"
import { useLmsActions } from "../hooks/useLmsActions"
import { useLmsFormStore, useUiStore } from "../stores"
import { AddCourseDialog } from "./AddCourseDialog"
import { CourseSelector } from "./CourseSelector"
import { FormField } from "./FormField"
import { Section } from "./Section"

export function LmsConfigSection() {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const lmsForm = useLmsFormStore()
  const ui = useUiStore()
  const { verifyCourse } = useLmsActions()

  const handleCourseAdded = (index: number) => {
    verifyCourse(index)
  }

  return (
    <Section id="lms-config" title="LMS Configuration">
      <FormField label="LMS Type" tooltip="Learning Management System type">
        <Select
          value={lmsForm.lmsType}
          onValueChange={(v) => lmsForm.setLmsType(v as "Canvas" | "Moodle")}
        >
          <SelectTrigger size="xs" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Canvas" size="xs">
              Canvas
            </SelectItem>
            <SelectItem value="Moodle" size="xs">
              Moodle
            </SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      {lmsForm.lmsType === "Canvas" && (
        <FormField label="Base URL" tooltip="Canvas instance URL">
          <Select
            value={lmsForm.urlOption}
            onValueChange={(v) =>
              lmsForm.setField("urlOption", v as "TUE" | "CUSTOM")
            }
          >
            <SelectTrigger size="xs" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TUE" size="xs">
                TU/e (canvas.tue.nl)
              </SelectItem>
              <SelectItem value="CUSTOM" size="xs">
                Custom URL
              </SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      )}

      {(lmsForm.urlOption === "CUSTOM" || lmsForm.lmsType !== "Canvas") && (
        <FormField label="Custom URL">
          <Input
            size="xs"
            value={lmsForm.customUrl}
            onChange={(e) => lmsForm.setField("customUrl", e.target.value)}
            placeholder="https://..."
            className="flex-1"
          />
        </FormField>
      )}

      <FormField label="Access Token" tooltip="API access token from your LMS">
        <div className="flex gap-1 flex-1">
          <Input
            size="xs"
            type={lmsForm.accessToken ? "password" : "text"}
            value={lmsForm.accessToken}
            onChange={(e) => lmsForm.setField("accessToken", e.target.value)}
            placeholder={lmsForm.accessToken ? "••••••••" : "Not set"}
            className={cn(
              "flex-1 password-input",
              !lmsForm.accessToken && "token-empty",
            )}
          />
          <Button
            size="xs"
            variant="outline"
            onClick={() => ui.openLmsTokenDialog(lmsForm.accessToken)}
          >
            Edit
          </Button>
        </div>
      </FormField>

      <FormField label="Course" tooltip="Select and verify your LMS course">
        <CourseSelector
          onVerifyCourse={verifyCourse}
          onAddCourse={() => setAddDialogOpen(true)}
        />
      </FormField>

      <AddCourseDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCourseAdded={handleCourseAdded}
      />
    </Section>
  )
}
