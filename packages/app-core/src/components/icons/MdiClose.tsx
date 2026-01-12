// Icon from Material Design Icons (MDI): https://pictogrammers.com/library/mdi/icon/close/
import * as React from "react"

type IconProps = React.SVGProps<SVGSVGElement> & { title?: string }

export const MdiClose = React.forwardRef<SVGSVGElement, IconProps>(
  ({ title = "Remove", ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      fill="currentColor"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
    </svg>
  ),
)

MdiClose.displayName = "MdiClose"
