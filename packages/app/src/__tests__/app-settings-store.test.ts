import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  createWorkflowClient,
  type WorkflowClient,
} from "@repo-edu/application-contract";
import {
  defaultAppSettings,
  persistedAppSettingsKind,
  type PersistedAppSettings,
} from "@repo-edu/domain";
import {
  clearWorkflowClient,
  setWorkflowClient,
} from "../contexts/workflow-client.js";
import { useAppSettingsStore } from "../stores/app-settings-store.js";
import { useConnectionsStore } from "../stores/connections-store.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeSettings(
  overrides: Partial<PersistedAppSettings> = {},
): PersistedAppSettings {
  return {
    ...defaultAppSettings,
    kind: persistedAppSettingsKind,
    schemaVersion: 1,
    ...overrides,
  };
}

beforeEach(() => {
  clearWorkflowClient();
  useAppSettingsStore.getState().reset();
  useConnectionsStore.getState().resetAllStatuses();
});

describe("app settings store", () => {
  it("tracks loading status while settings are being fetched", async () => {
    const gate = deferred<PersistedAppSettings>();
    const client = createWorkflowClient({
      "settings.loadApp": async () => gate.promise,
      "settings.saveApp": async (settings) => settings,
    });
    setWorkflowClient(client as unknown as WorkflowClient);

    const loadPromise = useAppSettingsStore.getState().load();
    assert.equal(useAppSettingsStore.getState().status, "loading");

    gate.resolve(
      makeSettings({
        activeProfileId: "profile-1",
      }),
    );
    await loadPromise;

    const state = useAppSettingsStore.getState();
    assert.equal(state.status, "loaded");
    assert.equal(state.settings.activeProfileId, "profile-1");
  });

  it("keeps local mutations visible during save and returns to loaded status", async () => {
    const saveGate = deferred<PersistedAppSettings>();
    const client = createWorkflowClient({
      "settings.loadApp": async () => makeSettings(),
      "settings.saveApp": async () => saveGate.promise,
    });
    setWorkflowClient(client as unknown as WorkflowClient);

    await useAppSettingsStore.getState().load();
    useAppSettingsStore.getState().setActiveProfileId("profile-2");
    useAppSettingsStore.getState().setTheme("dark");

    const savePromise = useAppSettingsStore.getState().save();
    assert.equal(useAppSettingsStore.getState().status, "saving");
    assert.equal(
      useAppSettingsStore.getState().settings.activeProfileId,
      "profile-2",
    );
    assert.equal(useAppSettingsStore.getState().settings.appearance.theme, "dark");

    saveGate.resolve(
      makeSettings({
        activeProfileId: "profile-2",
        appearance: {
          theme: "dark",
          windowChrome: "system",
        },
      }),
    );
    await savePromise;

    assert.equal(useAppSettingsStore.getState().status, "loaded");
    assert.equal(useAppSettingsStore.getState().error, null);
  });

  it("captures save errors in state", async () => {
    const client = createWorkflowClient({
      "settings.loadApp": async () => makeSettings(),
      "settings.saveApp": async () => {
        throw new Error("cannot save");
      },
    });
    setWorkflowClient(client as unknown as WorkflowClient);

    await useAppSettingsStore.getState().load();
    await useAppSettingsStore.getState().save();

    assert.equal(useAppSettingsStore.getState().status, "error");
    assert.equal(useAppSettingsStore.getState().error, "cannot save");
  });
});
