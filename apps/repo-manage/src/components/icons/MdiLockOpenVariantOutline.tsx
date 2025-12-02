// Icon from Material Design Icons (MDI): https://pictogrammers.com/library/mdi/icon/lock-open-variant-outline/
import * as React from "react";

type IconProps = React.SVGProps<SVGSVGElement> & { title?: string };

export const MdiLockOpenVariantOutline = React.forwardRef<SVGSVGElement, IconProps>(
  ({ title = "Unlocked", ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      fill="currentColor"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M10 13C11.1 13 12 13.89 12 15C12 16.11 11.11 17 10 17S8 16.11 8 15 8.9 13 10 13M18 1C15.24 1 13 3.24 13 6V8H4C2.9 8 2 8.9 2 10V20C2 21.1 2.9 22 4 22H16C17.1 22 18 21.1 18 20V10C18 8.9 17.1 8 16 8H15V6C15 4.34 16.34 3 18 3S21 4.34 21 6V8H23V6C23 3.24 20.76 1 18 1M16 10V20H4V10H16Z" />
    </svg>
  ),
);

MdiLockOpenVariantOutline.displayName = "MdiLockOpenVariantOutline";
