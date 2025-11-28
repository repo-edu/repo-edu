import { Card, CardContent, CardHeader, CardTitle } from "@repo-edu/ui";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Section({ title, children, className }: SectionProps) {
  return (
    <Card size="compact" className={className}>
      <CardHeader size="compact">
        <CardTitle size="compact">{title}</CardTitle>
      </CardHeader>
      <CardContent size="compact" className="space-y-1.5">
        {children}
      </CardContent>
    </Card>
  );
}
