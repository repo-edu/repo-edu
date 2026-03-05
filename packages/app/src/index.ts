// ---------------------------------------------------------------------------
// React app — the primary export for Phase 4+.
// ---------------------------------------------------------------------------
export const packageId = "@repo-edu/app";
export const workspaceDependencies = [
  "@repo-edu/domain",
  "@repo-edu/application-contract",
  "@repo-edu/renderer-host-contract",
  "@repo-edu/ui",
] as const;

export { AppRoot } from "./components/App.js";
export type { AppRootProps } from "./components/App.js";
export { configureApp } from "./configure-app.js";
export type { AppConfiguration } from "./configure-app.js";

// ---------------------------------------------------------------------------
// Contexts — shells inject these to wire the app to the host environment.
// ---------------------------------------------------------------------------
export {
  WorkflowClientProvider,
  useWorkflowClient,
  setWorkflowClient,
  clearWorkflowClient,
  getWorkflowClient,
} from "./contexts/workflow-client.js";

export {
  RendererHostProvider,
  useRendererHost,
  setRendererHost,
  clearRendererHost,
  getRendererHost,
} from "./contexts/renderer-host.js";

// ---------------------------------------------------------------------------
// Stores — exposed for shell-level integration and testing.
// ---------------------------------------------------------------------------
export { useProfileStore } from "./stores/profile-store.js";
export { useAppSettingsStore } from "./stores/app-settings-store.js";
export { useUiStore } from "./stores/ui-store.js";
export { useOperationStore } from "./stores/operation-store.js";
export { useConnectionsStore } from "./stores/connections-store.js";
export { useToastStore } from "./stores/toast-store.js";

// ---------------------------------------------------------------------------
// Hooks — exposed for shell-level integration.
// ---------------------------------------------------------------------------
export { useTheme } from "./hooks/use-theme.js";
export { useDirtyState } from "./hooks/use-dirty-state.js";
export { useProfiles } from "./hooks/use-profiles.js";
export { useAppSettings } from "./hooks/use-app-settings.js";
export { useIssues } from "./hooks/use-issues.js";
