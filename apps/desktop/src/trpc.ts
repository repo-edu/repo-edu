import {
  type AppSettingsStore,
  createProfileWorkflowHandlers,
  createSettingsWorkflowHandlers,
  createValidationWorkflowHandlers,
  type ProfileStore,
  runSpikeCorsWorkflow,
  runSpikeWorkflow,
} from "@repo-edu/application";
import type {
  AppError,
  AssignmentValidationInput,
  DiagnosticOutput,
  MilestoneProgress,
  RosterValidationInput,
  SpikeCorsWorkflowEvent,
  SpikeWorkflowEvent,
  WorkflowEventFor,
} from "@repo-edu/application-contract";
import {
  createCancelledAppError,
  isAppError,
} from "@repo-edu/application-contract";
import type { PersistedAppSettings, PersistedProfile } from "@repo-edu/domain";
import type { HttpPort } from "@repo-edu/host-runtime-contract";
import { initTRPC } from "@trpc/server";
import { observable } from "@trpc/server/observable";

const t = initTRPC.create();

export type DesktopProgressEvent = {
  index: number;
  label: string;
};

const phaseOneEvents: readonly DesktopProgressEvent[] = [
  {
    index: 1,
    label: "IPC request reached the Electron main process.",
  },
  {
    index: 2,
    label: "Typed subscription payload streamed back to the renderer.",
  },
  {
    index: 3,
    label: "Subscription completed cleanly after multiple progress events.",
  },
] as const;

function parseRosterValidationInput(value: unknown): RosterValidationInput {
  if (typeof value !== "object" || value === null) {
    throw new Error("Roster validation input must be an object.");
  }

  const record = value as { profileId?: unknown };
  if (typeof record.profileId !== "string" || record.profileId.length === 0) {
    throw new Error("profileId is required.");
  }

  return {
    profileId: record.profileId,
  };
}

function parseAssignmentValidationInput(
  value: unknown,
): AssignmentValidationInput {
  if (typeof value !== "object" || value === null) {
    throw new Error("Assignment validation input must be an object.");
  }

  const record = value as { profileId?: unknown; assignmentId?: unknown };
  if (typeof record.profileId !== "string" || record.profileId.length === 0) {
    throw new Error("profileId is required.");
  }
  if (
    typeof record.assignmentId !== "string" ||
    record.assignmentId.length === 0
  ) {
    throw new Error("assignmentId is required.");
  }

  return {
    profileId: record.profileId,
    assignmentId: record.assignmentId,
  };
}

function parseProfileLoadInput(value: unknown): { profileId: string } {
  if (typeof value !== "object" || value === null) {
    throw new Error("Profile load input must be an object.");
  }

  const record = value as { profileId?: unknown };
  if (typeof record.profileId !== "string" || record.profileId.length === 0) {
    throw new Error("profileId is required.");
  }

  return {
    profileId: record.profileId,
  };
}

function parsePersistedProfileInput(value: unknown): PersistedProfile {
  if (typeof value !== "object" || value === null) {
    throw new Error("Profile save input must be an object.");
  }

  return value as PersistedProfile;
}

function parsePersistedAppSettingsInput(value: unknown): PersistedAppSettings {
  if (typeof value !== "object" || value === null) {
    throw new Error("App settings input must be an object.");
  }

  return value as PersistedAppSettings;
}

/**
 * Creates the desktop tRPC router with injected host ports.
 *
 * Ports are injected at construction so use-cases run Node-side with real
 * adapters while the router definition remains declarative.
 */
export function createDesktopRouter(ports: {
  http: HttpPort;
  profileStore: ProfileStore;
  appSettingsStore: AppSettingsStore;
}) {
  const profileHandlers = createProfileWorkflowHandlers(ports.profileStore);
  const settingsHandlers = createSettingsWorkflowHandlers(
    ports.appSettingsStore,
  );
  const validationHandlers = createValidationWorkflowHandlers(
    ports.profileStore,
  );

  return t.router({
    phaseOneProgress: t.procedure.subscription(() =>
      observable<DesktopProgressEvent>((emit) => {
        let nextIndex = 0;

        const interval = setInterval(() => {
          const nextEvent = phaseOneEvents[nextIndex];

          if (!nextEvent) {
            clearInterval(interval);
            emit.complete();
            return;
          }

          emit.next(nextEvent);
          nextIndex += 1;
        }, 60);

        return () => {
          clearInterval(interval);
        };
      }),
    ),

    profileListWorkflow: t.procedure.subscription(() =>
      observable<WorkflowEventFor<"profile.list">>((emit) => {
        const abortController = new AbortController();

        profileHandlers["profile.list"](undefined, {
          signal: abortController.signal,
        })
          .then((result) => {
            emit.next({ type: "completed", data: result });
            emit.complete();
          })
          .catch((error) => {
            emitFailure(emit, abortController.signal, error);
          });

        return () => {
          abortController.abort();
        };
      }),
    ),

    profileLoadWorkflow: t.procedure
      .input({ parse: parseProfileLoadInput })
      .subscription(({ input }) =>
        observable<WorkflowEventFor<"profile.load">>((emit) => {
          const abortController = new AbortController();

          profileHandlers["profile.load"](input, {
            signal: abortController.signal,
            onProgress(data: MilestoneProgress) {
              emit.next({ type: "progress", data });
            },
            onOutput(data: DiagnosticOutput) {
              emit.next({ type: "output", data });
            },
          })
            .then((result) => {
              emit.next({ type: "completed", data: result });
              emit.complete();
            })
            .catch((error) => {
              emitFailure(emit, abortController.signal, error);
            });

          return () => {
            abortController.abort();
          };
        }),
      ),

    profileSaveWorkflow: t.procedure
      .input({ parse: parsePersistedProfileInput })
      .subscription(({ input }) =>
        observable<WorkflowEventFor<"profile.save">>((emit) => {
          const abortController = new AbortController();

          profileHandlers["profile.save"](input, {
            signal: abortController.signal,
            onProgress(data: MilestoneProgress) {
              emit.next({ type: "progress", data });
            },
            onOutput(data: DiagnosticOutput) {
              emit.next({ type: "output", data });
            },
          })
            .then((result) => {
              emit.next({ type: "completed", data: result });
              emit.complete();
            })
            .catch((error) => {
              emitFailure(emit, abortController.signal, error);
            });

          return () => {
            abortController.abort();
          };
        }),
      ),

    settingsLoadWorkflow: t.procedure.subscription(() =>
      observable<WorkflowEventFor<"settings.loadApp">>((emit) => {
        const abortController = new AbortController();

        settingsHandlers["settings.loadApp"](undefined, {
          signal: abortController.signal,
        })
          .then((result) => {
            emit.next({ type: "completed", data: result });
            emit.complete();
          })
          .catch((error) => {
            emitFailure(emit, abortController.signal, error);
          });

        return () => {
          abortController.abort();
        };
      }),
    ),

    settingsSaveWorkflow: t.procedure
      .input({ parse: parsePersistedAppSettingsInput })
      .subscription(({ input }) =>
        observable<WorkflowEventFor<"settings.saveApp">>((emit) => {
          const abortController = new AbortController();

          settingsHandlers["settings.saveApp"](input, {
            signal: abortController.signal,
            onProgress(data: MilestoneProgress) {
              emit.next({ type: "progress", data });
            },
            onOutput(data: DiagnosticOutput) {
              emit.next({ type: "output", data });
            },
          })
            .then((result) => {
              emit.next({ type: "completed", data: result });
              emit.complete();
            })
            .catch((error) => {
              emitFailure(emit, abortController.signal, error);
            });

          return () => {
            abortController.abort();
          };
        }),
      ),

    spikeWorkflow: t.procedure.subscription(() =>
      observable<SpikeWorkflowEvent>((emit) => {
        const abortController = new AbortController();

        runSpikeWorkflow({
          onProgress(data) {
            emit.next({ type: "progress", data });
          },
          onOutput(data) {
            emit.next({ type: "output", data });
          },
          signal: abortController.signal,
        })
          .then((result) => {
            emit.next({ type: "completed", data: result });
            emit.complete();
          })
          .catch((error) => {
            emitFailure(emit, abortController.signal, error);
          });

        return () => {
          abortController.abort();
        };
      }),
    ),

    spikeCorsWorkflow: t.procedure.subscription(() =>
      observable<SpikeCorsWorkflowEvent>((emit) => {
        const abortController = new AbortController();

        runSpikeCorsWorkflow(
          { http: ports.http },
          {
            onProgress(data) {
              emit.next({ type: "progress", data });
            },
            onOutput(data) {
              emit.next({ type: "output", data });
            },
            signal: abortController.signal,
          },
        )
          .then((result) => {
            emit.next({ type: "completed", data: result });
            emit.complete();
          })
          .catch((error) => {
            emitFailure(emit, abortController.signal, error);
          });

        return () => {
          abortController.abort();
        };
      }),
    ),

    validationRosterWorkflow: t.procedure
      .input({ parse: parseRosterValidationInput })
      .subscription(({ input }) =>
        observable<WorkflowEventFor<"validation.roster">>((emit) => {
          const abortController = new AbortController();

          validationHandlers["validation.roster"](input, {
            signal: abortController.signal,
          })
            .then((result) => {
              emit.next({ type: "completed", data: result });
              emit.complete();
            })
            .catch((error) => {
              emitFailure(emit, abortController.signal, error);
            });

          return () => {
            abortController.abort();
          };
        }),
      ),

    validationAssignmentWorkflow: t.procedure
      .input({ parse: parseAssignmentValidationInput })
      .subscription(({ input }) =>
        observable<WorkflowEventFor<"validation.assignment">>((emit) => {
          const abortController = new AbortController();

          validationHandlers["validation.assignment"](input, {
            signal: abortController.signal,
          })
            .then((result) => {
              emit.next({ type: "completed", data: result });
              emit.complete();
            })
            .catch((error) => {
              emitFailure(emit, abortController.signal, error);
            });

          return () => {
            abortController.abort();
          };
        }),
      ),
  });
}

function emitFailure(
  emit: {
    next(value: { type: "failed"; error: AppError }): void;
    complete(): void;
  },
  signal: AbortSignal,
  error: unknown,
) {
  if (signal.aborted) {
    emit.next({
      type: "failed",
      error: createCancelledAppError(),
    });
  } else if (isAppError(error)) {
    emit.next({
      type: "failed",
      error,
    });
  } else {
    emit.next({
      type: "failed",
      error: {
        type: "unexpected",
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      },
    });
  }
  emit.complete();
}

export type DesktopRouter = ReturnType<typeof createDesktopRouter>;
