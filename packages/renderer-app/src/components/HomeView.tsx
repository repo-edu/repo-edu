import { useOpenRepositoriesFolder } from "../hooks/use-open-repositories-folder.js"
import { useOpenSubmissionFolder } from "../hooks/use-open-submission-folder.js"
import { CourseSetupForm } from "./CourseSetupForm.js"
import { SourceActionCard } from "./SourceActionCard.js"

export function HomeView() {
  const openRepositoriesFolder = useOpenRepositoriesFolder()
  const openSubmissionFolder = useOpenSubmissionFolder()

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        <div className="space-y-3">
          <CourseSetupForm />

          <SourceActionCard
            title="Open an existing folder of repos"
            description="Open any folder containing student repositories for one-off analysis. No course is created and no roster is tracked. Recent folders are remembered in the course menu."
            selected={false}
            onClick={() => void openRepositoriesFolder()}
          />

          <SourceActionCard
            title="Open a student submission folder"
            description="Open one submitted folder and choose the files for examination questions. No course is created and no student details are stored."
            selected={false}
            onClick={() => void openSubmissionFolder()}
          />
        </div>
      </div>
    </div>
  )
}
