// Icon from Material Design Icons (MDI): https://pictogrammers.com/library/mdi/icon/loading/
import * as React from "react"

type IconProps = React.SVGProps<SVGSVGElement> & { title?: string }

export const MdiLoading = React.forwardRef<SVGSVGElement, IconProps>(
  ({ title = "Loading", className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      fill="currentColor"
      className={`animate-spin ${className ?? ""}`}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" />
    </svg>
  ),
)

MdiLoading.displayName = "MdiLoading"
