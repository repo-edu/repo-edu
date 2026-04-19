import { GripHorizontal } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "../../lib/utils"

const ResizablePanelGroup = ({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => (
  <ResizablePrimitive.Group
    orientation={orientation}
    className={cn(
      "flex h-full w-full",
      orientation === "vertical" && "flex-col",
      className,
    )}
    {...props}
  />
)

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean
}) => (
  <ResizablePrimitive.Separator
    className={cn(
      "relative flex items-center justify-center bg-border/50 transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
      "aria-[orientation=horizontal]:h-1.5 aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize",
      "aria-[orientation=vertical]:w-1.5 aria-[orientation=vertical]:h-full aria-[orientation=vertical]:cursor-col-resize",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-3 w-8 items-center justify-center rounded-full border bg-border shadow-sm">
        <GripHorizontal className="h-2.5 w-2.5 text-muted-foreground" />
      </div>
    )}
  </ResizablePrimitive.Separator>
)

export type ResizablePanelHandle = ResizablePrimitive.PanelImperativeHandle

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
