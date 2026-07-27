import { FormField } from "@repo-edu/ui"
import { selectDefaultExtensions } from "../../session/selectors.js"
import {
  useSessionController,
  useSessionControllerSelector,
} from "../../session/session-controller-context.js"
import { ExtensionTagInput } from "./ExtensionTagInput.js"

export function AnalysisPane() {
  const controller = useSessionController()
  const defaultExtensions = useSessionControllerSelector(
    selectDefaultExtensions,
  )

  const handleChange = (next: string[]) => {
    controller.setDefaultExtensions(next)
  }

  return (
    <div className="space-y-6">
      <FormField
        label="Default file extensions"
        htmlFor="analysis-default-extensions"
        description="Fallback extensions used when a course leaves Extensions unset. A grey info icon on a chip means that extension lacks comment detection or syntax colorization."
      >
        <ExtensionTagInput
          id="analysis-default-extensions"
          className="max-w-xl"
          values={defaultExtensions}
          onChange={handleChange}
          placeholder="ts, tsx, py, …"
          ariaLabel="Default file extensions"
        />
      </FormField>
    </div>
  )
}
