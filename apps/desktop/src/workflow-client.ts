import type {
  AppError,
  WorkflowCallOptions,
  WorkflowClient,
  WorkflowEventFor,
  WorkflowHandlerMap,
  WorkflowInput,
  WorkflowOutput,
  WorkflowProgress,
  WorkflowResult,
} from "@repo-edu/application-contract";
import {
  createCancelledAppError,
  createTransportAppError,
  createWorkflowClient,
  workflowCatalog,
} from "@repo-edu/application-contract";
import { createTRPCProxyClient } from "@trpc/client";
import { ipcLink } from "trpc-electron/renderer";
import type { DesktopRouter } from "./trpc";

type DesktopWorkflowId = keyof typeof workflowCatalog;

type SubscriptionHandlers<TWorkflowId extends DesktopWorkflowId> = {
  onData(event: WorkflowEventFor<TWorkflowId>): void;
  onError(error: Error): void;
  onComplete(): void;
};

const trpcClient = createTRPCProxyClient<DesktopRouter>({
  links: [ipcLink<DesktopRouter>()],
});

function runSubscriptionFromFactory<TWorkflowId extends DesktopWorkflowId>(
  subscribe: (
    handlers: SubscriptionHandlers<TWorkflowId>,
  ) => { unsubscribe(): void },
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

function subscribeWorkflow<TWorkflowId extends DesktopWorkflowId>(
  workflowId: TWorkflowId,
  input: WorkflowInput<TWorkflowId>,
  handlers: SubscriptionHandlers<TWorkflowId>,
): { unsubscribe(): void } {
  const procedure = trpcClient[workflowId] as {
    subscribe(
      value: WorkflowInput<TWorkflowId>,
      subscriptionHandlers: SubscriptionHandlers<TWorkflowId>,
    ): { unsubscribe(): void };
  };

  return procedure.subscribe(input, handlers);
}

function runDesktopWorkflow<TWorkflowId extends DesktopWorkflowId>(
  workflowId: TWorkflowId,
  input: WorkflowInput<TWorkflowId>,
  options?: WorkflowCallOptions<
    WorkflowProgress<TWorkflowId>,
    WorkflowOutput<TWorkflowId>
  >,
): Promise<WorkflowResult<TWorkflowId>> {
  return runSubscriptionFromFactory(
    (handlers) => subscribeWorkflow(workflowId, input, handlers),
    options,
  );
}

function normalizeTransportError(error: Error): AppError {
  const reason = /timeout/i.test(error.message)
    ? "timeout"
    : "ipc-disconnected";

  return createTransportAppError(reason, error.message);
}

function createDesktopWorkflowHandlers(): WorkflowHandlerMap<DesktopWorkflowId> {
  return {
    "profile.list": (input, options) =>
      runDesktopWorkflow("profile.list", input, options),
    "profile.load": (input, options) =>
      runDesktopWorkflow("profile.load", input, options),
    "profile.save": (input, options) =>
      runDesktopWorkflow("profile.save", input, options),
    "settings.loadApp": (input, options) =>
      runDesktopWorkflow("settings.loadApp", input, options),
    "settings.saveApp": (input, options) =>
      runDesktopWorkflow("settings.saveApp", input, options),
    "connection.verifyLmsDraft": (input, options) =>
      runDesktopWorkflow("connection.verifyLmsDraft", input, options),
    "connection.verifyGitDraft": (input, options) =>
      runDesktopWorkflow("connection.verifyGitDraft", input, options),
    "roster.importFromFile": (input, options) =>
      runDesktopWorkflow("roster.importFromFile", input, options),
    "roster.importFromLms": (input, options) =>
      runDesktopWorkflow("roster.importFromLms", input, options),
    "roster.exportStudents": (input, options) =>
      runDesktopWorkflow("roster.exportStudents", input, options),
    "groupSet.fetchAvailableFromLms": (input, options) =>
      runDesktopWorkflow("groupSet.fetchAvailableFromLms", input, options),
    "groupSet.syncFromLms": (input, options) =>
      runDesktopWorkflow("groupSet.syncFromLms", input, options),
    "groupSet.previewImportFromFile": (input, options) =>
      runDesktopWorkflow("groupSet.previewImportFromFile", input, options),
    "groupSet.previewReimportFromFile": (input, options) =>
      runDesktopWorkflow("groupSet.previewReimportFromFile", input, options),
    "groupSet.export": (input, options) =>
      runDesktopWorkflow("groupSet.export", input, options),
    "gitUsernames.import": (input, options) =>
      runDesktopWorkflow("gitUsernames.import", input, options),
    "validation.roster": (input, options) =>
      runDesktopWorkflow("validation.roster", input, options),
    "validation.assignment": (input, options) =>
      runDesktopWorkflow("validation.assignment", input, options),
    "repo.create": (input, options) =>
      runDesktopWorkflow("repo.create", input, options),
    "repo.clone": (input, options) =>
      runDesktopWorkflow("repo.clone", input, options),
    "repo.delete": (input, options) =>
      runDesktopWorkflow("repo.delete", input, options),
    "userFile.inspectSelection": (input, options) =>
      runDesktopWorkflow("userFile.inspectSelection", input, options),
    "userFile.exportPreview": (input, options) =>
      runDesktopWorkflow("userFile.exportPreview", input, options),
    "spike.e2e-trpc": (input, options) =>
      runDesktopWorkflow("spike.e2e-trpc", input, options),
    "spike.cors-http": (input, options) =>
      runDesktopWorkflow("spike.cors-http", input, options),
  };
}

export function createDesktopWorkflowClient(): WorkflowClient<DesktopWorkflowId> {
  return createWorkflowClient(createDesktopWorkflowHandlers());
}
