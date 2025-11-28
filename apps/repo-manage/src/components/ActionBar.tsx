import { forwardRef } from "react";

interface ActionBarProps {
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

export const ActionBar = forwardRef<HTMLDivElement, ActionBarProps>(
  ({ children, right, className }, ref) => (
    <div ref={ref} className={`flex gap-2 mt-1 items-center ${className ?? ""}`}>
      <div className="flex gap-2 items-center">{children}</div>
      {right}
    </div>
  )
);

ActionBar.displayName = "ActionBar";
