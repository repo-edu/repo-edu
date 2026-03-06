import {
  createConnectionWorkflowHandlers,
  createGroupSetWorkflowHandlers,
  createProfileWorkflowHandlers,
  createRepositoryWorkflowHandlers,
  createRosterWorkflowHandlers,
  createSettingsWorkflowHandlers,
  createValidationWorkflowHandlers,
} from "@repo-edu/application";
import {
  createWorkflowClient,
  type WorkflowClient,
} from "@repo-edu/application-contract";
import {
  createNodeFileSystemPort,
  createNodeGitCommandPort,
  createNodeHttpPort,
} from "@repo-edu/host-node";
import type {
  UserFilePort,
  UserFileReadRef,
  UserSaveTargetWriteRef,
} from "@repo-edu/host-runtime-contract";
import { createGitProviderClient } from "@repo-edu/integrations-git";
import type {
  CreateRepositoriesRequest,
  DeleteRepositoriesRequest,
  GitConnectionDraft,
  ResolveRepositoryCloneUrlsRequest,
} from "@repo-edu/integrations-git-contract";
import { createLmsClient } from "@repo-edu/integrations-lms";
import type { LmsConnectionDraft } from "@repo-edu/integrations-lms-contract";
import { createCliAppSettingsStore, createCliProfileStore } from "./state-store.js";

const unsupportedUserFilePort: UserFilePort = {
  async readText(reference: UserFileReadRef) {
    throw new Error(
      `CLI does not support file-reference reads for '${reference.displayName}'.`,
    );
  },
  async writeText(reference: UserSaveTargetWriteRef) {
    throw new Error(
      `CLI does not support save-target writes for '${reference.displayName}'.`,
    );
  },
};

function createLmsProviderDispatch() {
  const http = createNodeHttpPort();
  const clients = new Map<
    LmsConnectionDraft["provider"],
    ReturnType<typeof createLmsClient>
  >();

  const resolveClient = (provider: LmsConnectionDraft["provider"]) => {
    const existing = clients.get(provider);
    if (existing) {
      return existing;
    }

    const next = createLmsClient(provider, http);
    clients.set(provider, next);
    return next;
  };

  return {
    verifyConnection(draft: LmsConnectionDraft, signal?: AbortSignal) {
      return resolveClient(draft.provider).verifyConnection(draft, signal);
    },
    listCourses(draft: LmsConnectionDraft, signal?: AbortSignal) {
      return resolveClient(draft.provider).listCourses(draft, signal);
    },
    fetchRoster(draft: LmsConnectionDraft, courseId: string, signal?: AbortSignal) {
      return resolveClient(draft.provider).fetchRoster(draft, courseId, signal);
    },
    listGroupSets(
      draft: LmsConnectionDraft,
      courseId: string,
      signal?: AbortSignal,
    ) {
      return resolveClient(draft.provider).listGroupSets(draft, courseId, signal);
    },
    fetchGroupSet(
      draft: LmsConnectionDraft,
      courseId: string,
      groupSetId: string,
      signal?: AbortSignal,
    ) {
      return resolveClient(draft.provider).fetchGroupSet(
        draft,
        courseId,
        groupSetId,
        signal,
      );
    },
  };
}

function createGitProviderDispatch() {
  const http = createNodeHttpPort();
  const clients = new Map<
    GitConnectionDraft["provider"],
    ReturnType<typeof createGitProviderClient>
  >();

  const resolveClient = (provider: GitConnectionDraft["provider"]) => {
    const existing = clients.get(provider);
    if (existing) {
      return existing;
    }

    const next = createGitProviderClient(provider, http);
    clients.set(provider, next);
    return next;
  };

  return {
    verifyConnection(draft: GitConnectionDraft, signal?: AbortSignal) {
      return resolveClient(draft.provider).verifyConnection(draft, signal);
    },
    verifyGitUsernames(
      draft: GitConnectionDraft,
      usernames: string[],
      signal?: AbortSignal,
    ) {
      return resolveClient(draft.provider).verifyGitUsernames(
        draft,
        usernames,
        signal,
      );
    },
    createRepositories(
      draft: GitConnectionDraft,
      request: CreateRepositoriesRequest,
      signal?: AbortSignal,
    ) {
      return resolveClient(draft.provider).createRepositories(draft, request, signal);
    },
    resolveRepositoryCloneUrls(
      draft: GitConnectionDraft,
      request: ResolveRepositoryCloneUrlsRequest,
      signal?: AbortSignal,
    ) {
      return resolveClient(draft.provider).resolveRepositoryCloneUrls(
        draft,
        request,
        signal,
      );
    },
    deleteRepositories(
      draft: GitConnectionDraft,
      request: DeleteRepositoriesRequest,
      signal?: AbortSignal,
    ) {
      return resolveClient(draft.provider).deleteRepositories(draft, request, signal);
    },
  };
}

export function createCliWorkflowClient(): WorkflowClient {
  const profileStore = createCliProfileStore();
  const appSettingsStore = createCliAppSettingsStore();
  const lms = createLmsProviderDispatch();
  const git = createGitProviderDispatch();

  return createWorkflowClient({
    ...createProfileWorkflowHandlers(profileStore),
    ...createSettingsWorkflowHandlers(appSettingsStore),
    ...createConnectionWorkflowHandlers({ lms, git }),
    ...createValidationWorkflowHandlers(profileStore),
    ...createRosterWorkflowHandlers(profileStore, appSettingsStore, {
      lms,
      userFile: unsupportedUserFilePort,
    }),
    ...createGroupSetWorkflowHandlers(profileStore, appSettingsStore, {
      lms,
      userFile: unsupportedUserFilePort,
    }),
    ...createRepositoryWorkflowHandlers(profileStore, appSettingsStore, {
      git,
      gitCommand: createNodeGitCommandPort(),
      fileSystem: createNodeFileSystemPort(),
    }),
  });
}
