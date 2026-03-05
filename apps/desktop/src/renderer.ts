import React from "react";
import { createRoot } from "react-dom/client";
import { AppRoot } from "@repo-edu/app";
import type { AppError } from "@repo-edu/application-contract";
import { desktopSeedProfileId } from "./profile-ids";
import { createRendererHostFromBridge } from "./renderer-host-bridge";
import { createDesktopWorkflowClient } from "./workflow-client";

const trpcMarker = "repo-edu-desktop-trpc";
const searchParams = new URLSearchParams(window.location.search);
const isTRPCValidationMode = searchParams.get("mode") === "validate-trpc";

const mountNode = document.querySelector<HTMLDivElement>("#app");
if (!mountNode) {
  throw new Error("Renderer mount node #app was not found");
}

if (!window.repoEduDesktopHost) {
  throw new Error("Desktop renderer host bridge was not exposed from preload.");
}

const workflowClient = createDesktopWorkflowClient();
const rendererHost = createRendererHostFromBridge(window.repoEduDesktopHost);

function ensureValidationOutputNode(): HTMLOutputElement {
  let markerNode = document.querySelector<HTMLOutputElement>(
    "#repo-edu-trpc-marker",
  );

  if (markerNode) {
    return markerNode;
  }

  markerNode = document.createElement("output");
  markerNode.id = "repo-edu-trpc-marker";
  markerNode.hidden = true;
  document.body.append(markerNode);
  return markerNode;
}

function emitValidationMarker(payload: Record<string, unknown>) {
  const markerNode = ensureValidationOutputNode();
  markerNode.value = JSON.stringify(payload);
  markerNode.textContent = markerNode.value;
}

function normalizeAppError(error: unknown): AppError {
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    "message" in error &&
    typeof error.type === "string" &&
    typeof error.message === "string"
  ) {
    return error as AppError;
  }

  return {
    type: "unexpected",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}

async function collectValidationSnapshot() {
  const spikeProgressLabels: string[] = [];
  const environmentSnapshot = await rendererHost.getEnvironmentSnapshot();

  const profileList = await workflowClient.run("profile.list", undefined);
  const loadedProfile = await workflowClient.run("profile.load", {
    profileId: desktopSeedProfileId,
  });
  const savedProfile = await workflowClient.run("profile.save", loadedProfile);

  const loadedSettings = await workflowClient.run("settings.loadApp", undefined);
  const savedSettings = await workflowClient.run(
    "settings.saveApp",
    loadedSettings,
  );

  const rosterValidation = await workflowClient.run("validation.roster", {
    profileId: desktopSeedProfileId,
  });
  const assignmentValidation = await workflowClient.run(
    "validation.assignment",
    {
      profileId: desktopSeedProfileId,
      assignmentId: "a-seed-project-1",
    },
  );

  const spike = await workflowClient.run("spike.e2e-trpc", undefined, {
    onProgress(event) {
      spikeProgressLabels.push(event.label);
    },
  });

  let repoDeleteErrorType: AppError["type"] | null = null;
  try {
    await workflowClient.run("repo.delete", {
      profileId: desktopSeedProfileId,
      assignmentId: null,
      template: null,
      confirmDelete: false,
    });
  } catch (error) {
    repoDeleteErrorType = normalizeAppError(error).type;
  }

  return {
    environmentShell: environmentSnapshot.shell,
    environmentCanPromptForFiles: environmentSnapshot.canPromptForFiles,
    environmentWindowChrome: environmentSnapshot.windowChrome,
    profileCount: profileList.length,
    listedProfileIds: profileList.map((entry) => entry.id),
    loadedProfileId: loadedProfile.id,
    savedProfileId: savedProfile.id,
    savedProfileUpdatedAt: savedProfile.updatedAt,
    settingsKind: loadedSettings.kind,
    settingsSchemaVersion: savedSettings.schemaVersion,
    rosterIssueKinds: rosterValidation.issues.map((issue) => issue.kind),
    assignmentIssueKinds: assignmentValidation.issues.map((issue) => issue.kind),
    spikeWorkflowId: spike.workflowId,
    spikeProgressCount: spikeProgressLabels.length,
    repoDeleteErrorType,
  };
}

async function runValidationMode() {
  try {
    const snapshot = await collectValidationSnapshot();

    emitValidationMarker({
      marker: trpcMarker,
      validationProfileId: desktopSeedProfileId,
      ...snapshot,
    });
  } catch (error) {
    const appError = normalizeAppError(error);

    emitValidationMarker({
      marker: trpcMarker,
      error: appError.message,
      errorType: appError.type,
    });

    throw error;
  }
}

if (isTRPCValidationMode) {
  void runValidationMode();
} else {
  document.title = "Repo Edu Desktop";
  createRoot(mountNode).render(
    React.createElement(AppRoot, {
      workflowClient,
      rendererHost,
    }),
  );
}
