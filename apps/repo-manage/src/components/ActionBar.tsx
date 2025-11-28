interface ActionBarProps {
  children: React.ReactNode;
  right?: React.ReactNode;
}

export function ActionBar({ children, right }: ActionBarProps) {
  return (
    <div className="flex gap-2 mt-1 items-center">
      <div className="flex gap-2 items-center">{children}</div>
      {right}
    </div>
  );
}

