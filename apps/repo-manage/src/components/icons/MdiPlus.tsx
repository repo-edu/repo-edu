// Icon from Material Design Icons (MDI): https://pictogrammers.com/library/mdi/icon/plus/
import * as React from "react"

type IconProps = React.SVGProps<SVGSVGElement> & { title?: string }

export const MdiPlus = React.forwardRef<SVGSVGElement, IconProps>(
  ({ title = "Add", ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      fill="currentColor"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" />
    </svg>
  ),
)

MdiPlus.displayName = "MdiPlus"
