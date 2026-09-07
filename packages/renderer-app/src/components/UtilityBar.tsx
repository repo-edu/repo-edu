import { CourseSwitcher } from "./CourseSwitcher.js"

export function UtilityBar() {
  return (
    <div className="group/utilitybar border-t bg-muted/30">
      <div className="flex items-center gap-2 pl-2 pr-4 py-1.5 min-w-0">
        <div className="flex items-center min-w-0">
          <CourseSwitcher />
        </div>
        <div className="flex-1" />
      </div>
    </div>
  )
}
