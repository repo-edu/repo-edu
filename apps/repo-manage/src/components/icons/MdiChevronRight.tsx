// Icon from Material Design Icons (MDI): https://pictogrammers.com/library/mdi/icon/chevron-right/
import * as React from "react"

type IconProps = React.SVGProps<SVGSVGElement> & { title?: string }

export const MdiChevronRight = React.forwardRef<SVGSVGElement, IconProps>(
  ({ title = "Collapsed", ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      fill="currentColor"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z" />
    </svg>
  ),
)

MdiChevronRight.displayName = "MdiChevronRight"
