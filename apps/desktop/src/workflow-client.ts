import type {
  AppError,
  AssignmentValidationInput,
  RosterValidationInput,
  WorkflowCallOptions,
  WorkflowClient,
  WorkflowEventFor,
  WorkflowInput,
  WorkflowOutput,
  WorkflowProgress,
  WorkflowResult,
} from "@repo-edu/application-contract";
import {
  createCancelledAppError,
  createTransportAppError,
  createWorkflowClient,
} from "@repo-edu/application-contract";
import type { PersistedAppSettings, PersistedProfile } from "@repo-edu/domain";
import { createTRPCProxyClient } from "@trpc/client";
import { ipcLink } from "trpc-electron/renderer";
import type { DesktopRouter } from "./trpc";

type DesktopWorkflowId =
  | "profile.list"
  | "profile.load"
  | "profile.save"
  | "settings.loadApp"
  | "settings.saveApp"
  | "spike.e2e-trpc"
  | "spike.cors-http"
  | "validation.roster"
  | "validation.assignment";

const trpcClient = createTRPCProxyClient<DesktopRouter>({
  links: [ipcLink<DesktopRouter>()],
});

function runSubscriptionFromFactory<TWorkflowId extends DesktopWorkflowId>(
  subscribe: (handlers: {
    onData(event: WorkflowEventFor<TWorkflowId>): void;
    onError(error: Error): void;
    onComplete(): void;
  }) => { unsubscribe(): void },
  options?: WorkflowCallOptions<
    WorkflowProgress<TWorkflowId>,
    WorkflowOutput<TWorkflowId>
  >,
): Promise<WorkflowResult<TWorkflowId>> {
  if (options?.signal?.aborted) {
    return Promise.reject(createCancelledAppError());
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const abort = () => {
      if (settled) {
        return;
      }

      settled = true;
      subscription.unsubscribe();
      cleanup();
      reject(createCancelledAppError());
    };

    const cleanup = () => {
      options?.signal?.removeEventListener("abort", abort);
    };

    const subscription = subscribe({
      onData(event) {
        switch (event.type) {
          case "progress":
            options?.onProgress?.(event.data);
            return;
          case "output":
            options?.onOutput?.(event.data);
            return;
          case "completed":
            settled = true;
            cleanup();
            resolve(event.data);
            return;
          case "failed":
            settled = true;
            cleanup();
            reject(event.error);
        }
      },
      onError(error) {
        settled = true;
        cleanup();
        reject(normalizeTransportError(error));
      },
      onComplete() {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(
          createTransportAppError(
            "host-crash",
            "Subscription completed without a terminal workflow event.",
            false,
          ),
        );
      },
    });

    options?.signal?.addEventListener("abort", abort, { once: true });
  });
}

function runDesktopWorkflow<TWorkflowId extends DesktopWorkflowId>(
  workflowId: TWorkflowId,
  input: WorkflowInput<TWorkflowId>,
  options?: WorkflowCallOptions<
    WorkflowProgress<TWorkflowId>,
    WorkflowOutput<TWorkflowId>
  >,
): Promise<WorkflowResult<TWorkflowId>> {
  if (workflowId === "profile.list") {
    return runSubscriptionFromFactory<"profile.list">(
      (handlers) =>
        trpcClient.profileListWorkflow.subscribe(undefined, handlers),
      options as WorkflowCallOptions<
        WorkflowProgress<"profile.list">,
        WorkflowOutput<"profile.list">
      >,
    ) as Promise<WorkflowResult<TWorkflowId>>;
  }

  if (workflowId === "profile.load") {
    return runSubscriptionFromFactory<"profile.load">(
      (handlers) =>
        trpcClient.profileLoadWorkflow.subscribe(
          input as { profileId: string },
          handlers,
        ),
      options as WorkflowCallOptions<
        WorkflowProgress<"profile.load">,
        WorkflowOutput<"profile.load">
      >,
    ) as Promise<WorkflowResult<TWorkflowId>>;
  }

  if (workflowId === "profile.save") {
    return runSubscriptionFromFactory<"profile.save">(
      (handlers) =>
        trpcClient.profileSaveWorkflow.subscribe(
          input as PersistedProfile,
          handlers,
        ),
      options as WorkflowCallOptions<
        WorkflowProgress<"profile.save">,
        WorkflowOutput<"profile.save">
      >,
    ) as Promise<WorkflowResult<TWorkflowId>>;
  }

  if (workflowId === "settings.loadApp") {
    return runSubscriptionFromFactory<"settings.loadApp">(
      (handlers) =>
        trpcClient.settingsLoadWorkflow.subscribe(undefined, handlers),
      options as WorkflowCallOptions<
        WorkflowProgress<"settings.loadApp">,
        WorkflowOutput<"settings.loadApp">
      >,
    ) as Promise<WorkflowResult<TWorkflowId>>;
  }

  if (workflowId === "settings.saveApp") {
    return runSubscriptionFromFactory<"settings.saveApp">(
      (handlers) =>
        trpcClient.settingsSaveWorkflow.subscribe(
          input as PersistedAppSettings,
          handlers,
        ),
      options as WorkflowCallOptions<
        WorkflowProgress<"settings.saveApp">,
        WorkflowOutput<"settings.saveApp">
      >,
    ) as Promise<WorkflowResult<TWorkflowId>>;
  }

  if (workflowId === "spike.e2e-trpc") {
    return runSubscriptionFromFactory<"spike.e2e-trpc">(
      (handlers) => trpcClient.spikeWorkflow.subscribe(undefined, handlers),
      options as WorkflowCallOptions<
        WorkflowProgress<"spike.e2e-trpc">,
        WorkflowOutput<"spike.e2e-trpc">
      >,
    ) as Promise<WorkflowResult<TWorkflowId>>;
  }

  if (workflowId === "validation.roster") {
    return runSubscriptionFromFactory<"validation.roster">(
      (handlers) =>
        trpcClient.validationRosterWorkflow.subscribe(
          input as RosterValidationInput,
          handlers,
        ),
      options as WorkflowCallOptions<
        WorkflowProgress<"validation.roster">,
        WorkflowOutput<"validation.roster">
      >,
    ) as Promise<WorkflowResult<TWorkflowId>>;
  }

  if (workflowId === "validation.assignment") {
    return runSubscriptionFromFactory<"validation.assignment">(
      (handlers) =>
        trpcClient.validationAssignmentWorkflow.subscribe(
          input as AssignmentValidationInput,
          handlers,
        ),
      options as WorkflowCallOptions<
        WorkflowProgress<"validation.assignment">,
        WorkflowOutput<"validation.assignment">
      >,
    ) as Promise<WorkflowResult<TWorkflowId>>;
  }

  return runSubscriptionFromFactory<"spike.cors-http">(
    (handlers) => trpcClient.spikeCorsWorkflow.subscribe(undefined, handlers),
    options as WorkflowCallOptions<
      WorkflowProgress<"spike.cors-http">,
      WorkflowOutput<"spike.cors-http">
    >,
  ) as Promise<WorkflowResult<TWorkflowId>>;
}

function normalizeTransportError(error: Error): AppError {
  const reason = /timeout/i.test(error.message)
    ? "timeout"
    : "ipc-disconnected";

  return createTransportAppError(reason, error.message);
}

export function createDesktopWorkflowClient(): WorkflowClient<DesktopWorkflowId> {
  return createWorkflowClient<DesktopWorkflowId>({
    "profile.list": (_input, options) =>
      runDesktopWorkflow("profile.list", undefined, options),
    "profile.load": (input, options) =>
      runDesktopWorkflow("profile.load", input, options),
    "profile.save": (input, options) =>
      runDesktopWorkflow("profile.save", input, options),
    "settings.loadApp": (_input, options) =>
      runDesktopWorkflow("settings.loadApp", undefined, options),
    "settings.saveApp": (input, options) =>
      runDesktopWorkflow("settings.saveApp", input, options),
    "spike.e2e-trpc": (_input, options) =>
      runDesktopWorkflow("spike.e2e-trpc", undefined, options),
    "spike.cors-http": (_input, options) =>
      runDesktopWorkflow("spike.cors-http", undefined, options),
    "validation.roster": (input, options) =>
      runDesktopWorkflow("validation.roster", input, options),
    "validation.assignment": (input, options) =>
      runDesktopWorkflow("validation.assignment", input, options),
  });
}
