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
import { useEffect, useState } from "react"
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
  const { verifyCourse, fetchGroupCategories } = useLmsActions()

  const handleCourseAdded = (index: number) => {
    verifyCourse(index)
  }

  const isCanvas = lmsForm.lmsType === "Canvas"
  const activeConfig = isCanvas ? lmsForm.canvas : lmsForm.moodle
  const courses = isCanvas ? lmsForm.canvas.courses : lmsForm.moodle.courses
  const activeCourse = courses[lmsForm.activeCourseIndex]
  const hasVerifiedCourse = activeCourse?.status === "verified"
  const clearGroupCategories = lmsForm.clearGroupCategories

  // Fetch group categories when a verified course is selected
  useEffect(() => {
    if (hasVerifiedCourse && activeCourse?.id && activeConfig.accessToken) {
      fetchGroupCategories(activeCourse.id)
    } else {
      clearGroupCategories()
    }
  }, [
    hasVerifiedCourse,
    activeCourse?.id,
    activeConfig.accessToken,
    fetchGroupCategories,
    clearGroupCategories,
  ])

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

      {isCanvas && (
        <FormField label="Base URL" tooltip="Canvas instance URL">
          <Select
            value={lmsForm.canvas.urlOption}
            onValueChange={(v) =>
              lmsForm.setCanvasField("urlOption", v as "TUE" | "CUSTOM")
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

      {isCanvas && lmsForm.canvas.urlOption === "CUSTOM" && (
        <FormField label="Custom URL">
          <Input
            size="xs"
            value={lmsForm.canvas.customUrl}
            onChange={(e) =>
              lmsForm.setCanvasField("customUrl", e.target.value)
            }
            placeholder="https://..."
            className="flex-1"
          />
        </FormField>
      )}

      {!isCanvas && (
        <FormField label="Base URL" tooltip="Moodle instance URL">
          <Input
            size="xs"
            value={lmsForm.moodle.baseUrl}
            onChange={(e) => lmsForm.setMoodleField("baseUrl", e.target.value)}
            placeholder="https://..."
            className="flex-1"
          />
        </FormField>
      )}

      <FormField label="Access Token" tooltip="API access token from your LMS">
        <div className="flex gap-1 flex-1">
          <Input
            size="xs"
            type={activeConfig.accessToken ? "password" : "text"}
            value={activeConfig.accessToken}
            onChange={(e) =>
              isCanvas
                ? lmsForm.setCanvasField("accessToken", e.target.value)
                : lmsForm.setMoodleField("accessToken", e.target.value)
            }
            placeholder={activeConfig.accessToken ? "••••••••" : "Not set"}
            className={cn(
              "flex-1 password-input",
              !activeConfig.accessToken && "token-empty",
            )}
          />
          <Button
            size="xs"
            variant="outline"
            onClick={() => ui.openLmsTokenDialog(activeConfig.accessToken)}
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

      <FormField
        label="Group Set"
        tooltip="Filter students by group set (optional)"
      >
        {lmsForm.groupCategoriesError ? (
          <span className="text-xs text-muted-foreground italic">
            Unable to load ({lmsForm.groupCategoriesError})
          </span>
        ) : (
          <Select
            value={lmsForm.selectedGroupCategoryId || "all"}
            onValueChange={(v) =>
              lmsForm.setSelectedGroupCategoryId(v === "all" ? null : v)
            }
            disabled={
              !hasVerifiedCourse || lmsForm.groupCategories.length === 0
            }
          >
            <SelectTrigger size="xs" className="w-48">
              <SelectValue placeholder="All groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" size="xs">
                All groups
              </SelectItem>
              {lmsForm.groupCategories.map((category) => (
                <SelectItem key={category.id} value={category.id} size="xs">
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <AddCourseDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCourseAdded={handleCourseAdded}
      />
    </Section>
  )
}
