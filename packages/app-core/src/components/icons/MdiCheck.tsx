// Icon from Material Design Icons (MDI): https://pictogrammers.com/library/mdi/icon/check/
import * as React from "react"

type IconProps = React.SVGProps<SVGSVGElement> & { title?: string }

export const MdiCheck = React.forwardRef<SVGSVGElement, IconProps>(
  ({ title = "Verified", ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      fill="currentColor"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z" />
    </svg>
  ),
)

MdiCheck.displayName = "MdiCheck"
