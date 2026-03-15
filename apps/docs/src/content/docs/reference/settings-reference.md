---
title: Settings Reference
description: Persisted app settings and course fields
---

## App settings (`repo-edu.app-settings.v1`)

```ts
{
  kind: "repo-edu.app-settings.v1";
  schemaVersion: 1;
  activeCourseId: string | null;
  appearance: {
    theme: "system" | "light" | "dark";
    windowChrome: "system" | "hiddenInset";
    dateFormat: "MDY" | "DMY";
    timeFormat: "12h" | "24h";
  };
  lmsConnections: Array<{ name: string; provider: "canvas" | "moodle"; baseUrl: string; token: string }>;
  gitConnections: Array<{ id: string; provider: "github" | "gitlab" | "gitea"; baseUrl: string; token: string }>;
  lastOpenedAt: string | null;
}
```

## Course (`repo-edu.course.v1`)

```ts
{
  kind: "repo-edu.course.v1";
  schemaVersion: 1;
  revision: number;
  id: string;
  displayName: string;
  lmsConnectionName: string | null;
  gitConnectionId: string | null;
  organization: string | null;
  lmsCourseId: string | null;
  roster: { students; staff; groups; groupSets; assignments; connection };
  repositoryTemplate: { owner: string; name: string; visibility: "private" | "internal" | "public" } | null;
  updatedAt: string;
}
```
