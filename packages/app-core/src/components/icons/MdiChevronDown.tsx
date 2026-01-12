// Icon from Material Design Icons (MDI): https://pictogrammers.com/library/mdi/icon/chevron-down/
import * as React from "react"

type IconProps = React.SVGProps<SVGSVGElement> & { title?: string }

export const MdiChevronDown = React.forwardRef<SVGSVGElement, IconProps>(
  ({ title = "Expanded", ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      fill="currentColor"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
    </svg>
  ),
)

MdiChevronDown.displayName = "MdiChevronDown"
