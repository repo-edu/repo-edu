---
title: Settings Reference
description: Persisted app settings and profile fields
---

## App settings (`repo-edu.app-settings.v1`)

```ts
{
  kind: "repo-edu.app-settings.v1";
  schemaVersion: 1;
  activeProfileId: string | null;
  appearance: {
    theme: "system" | "light" | "dark";
    windowChrome: "system" | "hiddenInset";
    dateFormat: "MDY" | "DMY";
    timeFormat: "12h" | "24h";
  };
  lmsConnections: Array<{ name: string; provider: "canvas" | "moodle"; baseUrl: string; token: string }>;
  gitConnections: Array<{ name: string; provider: "github" | "gitlab" | "gitea"; baseUrl: string | null; token: string; organization: string | null }>;
  lastOpenedAt: string | null;
}
```

## Profile (`repo-edu.profile.v3`)

```ts
{
  kind: "repo-edu.profile.v3";
  schemaVersion: 3;
  revision: number;
  id: string;
  displayName: string;
  lmsConnectionName: string | null;
  gitConnectionName: string | null;
  courseId: string | null;
  roster: { students; staff; groups; groupSets; assignments; connection };
  repositoryTemplate: { owner: string; name: string; visibility: "private" | "internal" | "public" } | null;
  updatedAt: string;
}
```
