// Icon from Material Design Icons (MDI): https://pictogrammers.com/library/mdi/icon/alert/
import * as React from "react"

type IconProps = React.SVGProps<SVGSVGElement> & { title?: string }

export const MdiAlert = React.forwardRef<SVGSVGElement, IconProps>(
  ({ title = "Warning", ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      fill="currentColor"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z" />
    </svg>
  ),
)

MdiAlert.displayName = "MdiAlert"
