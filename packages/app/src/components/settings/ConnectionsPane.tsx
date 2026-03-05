import type {
  GitProviderKind,
  LmsProviderKind,
  PersistedGitConnection,
  PersistedLmsConnection,
} from "@repo-edu/domain";
import {
  Button,
  FormField,
  Input,
  PasswordInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "@repo-edu/ui/components/icons";
import { useMemo, useState } from "react";
import { getWorkflowClient } from "../../contexts/workflow-client.js";
import { useAppSettingsStore } from "../../stores/app-settings-store.js";
import { useToastStore } from "../../stores/toast-store.js";

type VerificationStatus = "idle" | "verifying" | "connected" | "error";

type LmsDraft = PersistedLmsConnection;
type GitDraft = PersistedGitConnection;

type SavedVerification = {
  status: VerificationStatus;
  error: string | null;
};

const LMS_PROVIDER_LABELS: Record<LmsProviderKind, string> = {
  canvas: "Canvas",
  moodle: "Moodle",
};

const GIT_PROVIDER_LABELS: Record<GitProviderKind, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
};

function statusLabel(status: VerificationStatus): string {
  switch (status) {
    case "verifying":
      return "Verifying";
    case "connected":
      return "Verified";
    case "error":
      return "Failed";
    default:
      return "Not verified";
  }
}

function emptyLmsDraft(): LmsDraft {
  return {
    name: "",
    provider: "canvas",
    baseUrl: "",
    token: "",
  };
}

function emptyGitDraft(): GitDraft {
  return {
    name: "",
    provider: "github",
    baseUrl: null,
    token: "",
    organization: null,
  };
}

export function ConnectionsPane() {
  const settings = useAppSettingsStore((state) => state.settings);
  const setLmsConnection = useAppSettingsStore((state) => state.setLmsConnection);
  const addLmsConnection = useAppSettingsStore((state) => state.addLmsConnection);
  const removeLmsConnection = useAppSettingsStore(
    (state) => state.removeLmsConnection,
  );
  const addGitConnection = useAppSettingsStore((state) => state.addGitConnection);
  const updateGitConnection = useAppSettingsStore(
    (state) => state.updateGitConnection,
  );
  const renameGitConnection = useAppSettingsStore(
    (state) => state.renameGitConnection,
  );
  const removeGitConnection = useAppSettingsStore(
    (state) => state.removeGitConnection,
  );
  const saveAppSettings = useAppSettingsStore((state) => state.save);
  const addToast = useToastStore((state) => state.addToast);

  const lmsConnections = settings.lmsConnections;
  const gitConnections = settings.gitConnections;

  const [showLmsEditor, setShowLmsEditor] = useState(false);
  const [lmsEditorIndex, setLmsEditorIndex] = useState<number | null>(null);
  const [lmsDraft, setLmsDraft] = useState<LmsDraft>(emptyLmsDraft());
  const [lmsEditorStatus, setLmsEditorStatus] =
    useState<VerificationStatus>("idle");
  const [lmsEditorError, setLmsEditorError] = useState<string | null>(null);

  const [showGitEditor, setShowGitEditor] = useState(false);
  const [gitEditorOriginalName, setGitEditorOriginalName] = useState<
    string | null
  >(null);
  const [gitDraft, setGitDraft] = useState<GitDraft>(emptyGitDraft());
  const [gitEditorStatus, setGitEditorStatus] =
    useState<VerificationStatus>("idle");
  const [gitEditorError, setGitEditorError] = useState<string | null>(null);

  const [lmsSavedStatuses, setLmsSavedStatuses] = useState<
    Record<string, SavedVerification>
  >({});
  const [gitSavedStatuses, setGitSavedStatuses] = useState<
    Record<string, SavedVerification>
  >({});

  const editingLms = showLmsEditor && lmsEditorIndex !== null;
  const editingGit = showGitEditor && gitEditorOriginalName !== null;

  const lmsNameTaken = useMemo(() => {
    const normalized = lmsDraft.name.trim().toLowerCase();
    if (!normalized) return false;
    return lmsConnections.some(
      (connection, index) =>
        index !== lmsEditorIndex &&
        connection.name.trim().toLowerCase() === normalized,
    );
  }, [lmsConnections, lmsDraft.name, lmsEditorIndex]);

  const gitNameTaken = useMemo(() => {
    const normalized = gitDraft.name.trim().toLowerCase();
    if (!normalized) return false;
    return gitConnections.some(
      (connection) =>
        connection.name.trim().toLowerCase() === normalized &&
        connection.name !== gitEditorOriginalName,
    );
  }, [gitConnections, gitDraft.name, gitEditorOriginalName]);

  const canSaveLms =
    lmsDraft.name.trim().length > 0 &&
    lmsDraft.baseUrl.trim().length > 0 &&
    lmsDraft.token.trim().length > 0 &&
    !lmsNameTaken;

  const canSaveGit =
    gitDraft.name.trim().length > 0 &&
    gitDraft.token.trim().length > 0 &&
    !gitNameTaken;

  const resetLmsEditor = () => {
    setShowLmsEditor(false);
    setLmsEditorIndex(null);
    setLmsDraft(emptyLmsDraft());
    setLmsEditorStatus("idle");
    setLmsEditorError(null);
  };

  const resetGitEditor = () => {
    setShowGitEditor(false);
    setGitEditorOriginalName(null);
    setGitDraft(emptyGitDraft());
    setGitEditorStatus("idle");
    setGitEditorError(null);
  };

  const verifyLms = async (draft: LmsDraft) => {
    setLmsEditorStatus("verifying");
    setLmsEditorError(null);
    try {
      const client = getWorkflowClient();
      await client.run("connection.verifyLmsDraft", {
        provider: draft.provider,
        baseUrl: draft.baseUrl.trim(),
        token: draft.token.trim(),
      });
      setLmsEditorStatus("connected");
      return { status: "connected" as const, error: null };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setLmsEditorStatus("error");
      setLmsEditorError(message);
      return { status: "error" as const, error: message };
    }
  };

  const verifyGit = async (draft: GitDraft) => {
    setGitEditorStatus("verifying");
    setGitEditorError(null);
    try {
      const client = getWorkflowClient();
      await client.run("connection.verifyGitDraft", {
        provider: draft.provider,
        baseUrl: draft.baseUrl?.trim() || null,
        token: draft.token.trim(),
        organization: draft.organization?.trim() || null,
      });
      setGitEditorStatus("connected");
      return { status: "connected" as const, error: null };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setGitEditorStatus("error");
      setGitEditorError(message);
      return { status: "error" as const, error: message };
    }
  };

  const handleSaveLms = async () => {
    if (!canSaveLms) return;

    const nextConnection: PersistedLmsConnection = {
      name: lmsDraft.name.trim(),
      provider: lmsDraft.provider,
      baseUrl: lmsDraft.baseUrl.trim(),
      token: lmsDraft.token.trim(),
    };

    if (lmsEditorIndex === null) {
      addLmsConnection(nextConnection);
    } else {
      setLmsConnection(lmsEditorIndex, nextConnection);
    }

    await saveAppSettings();
    addToast("LMS connection saved", { tone: "success" });
    resetLmsEditor();
  };

  const handleSaveGit = async () => {
    if (!canSaveGit) return;

    const nextConnection: PersistedGitConnection = {
      name: gitDraft.name.trim(),
      provider: gitDraft.provider,
      baseUrl: gitDraft.baseUrl?.trim() || null,
      token: gitDraft.token.trim(),
      organization: gitDraft.organization?.trim() || null,
    };

    if (gitEditorOriginalName === null) {
      addGitConnection(nextConnection);
    } else if (gitEditorOriginalName !== nextConnection.name) {
      renameGitConnection(
        gitEditorOriginalName,
        nextConnection.name,
        nextConnection,
      );
    } else {
      updateGitConnection(gitEditorOriginalName, nextConnection);
    }

    await saveAppSettings();
    addToast("Git connection saved", { tone: "success" });
    resetGitEditor();
  };

  const handleRemoveLms = async (index: number) => {
    removeLmsConnection(index);
    await saveAppSettings();
    addToast("LMS connection removed", { tone: "info" });
  };

  const handleRemoveGit = async (name: string) => {
    removeGitConnection(name);
    await saveAppSettings();
    addToast("Git connection removed", { tone: "info" });
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">LMS Connections</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowLmsEditor(true);
              setLmsEditorIndex(null);
              setLmsDraft(emptyLmsDraft());
              setLmsEditorStatus("idle");
              setLmsEditorError(null);
            }}
            disabled={showLmsEditor}
          >
            <Plus className="size-4 mr-1" />
            Add
          </Button>
        </div>

        {lmsConnections.length === 0 && !showLmsEditor && (
          <Text className="text-sm text-muted-foreground">
            No LMS connections configured.
          </Text>
        )}

        <div className="space-y-2">
          {lmsConnections.map((connection, index) => {
            const status = lmsSavedStatuses[connection.name] ?? {
              status: "idle" as VerificationStatus,
              error: null,
            };
            return (
              <div key={connection.name} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm">{connection.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {LMS_PROVIDER_LABELS[connection.provider]} ·{" "}
                      {connection.baseUrl}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {statusLabel(status.status)}
                    </div>
                    {status.error && (
                      <div className="text-xs text-destructive mt-1">
                        {status.error}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        setLmsSavedStatuses((current) => ({
                          ...current,
                          [connection.name]: {
                            status: "verifying",
                            error: null,
                          },
                        }));
                        try {
                          const client = getWorkflowClient();
                          await client.run("connection.verifyLmsDraft", {
                            provider: connection.provider,
                            baseUrl: connection.baseUrl,
                            token: connection.token,
                          });
                          setLmsSavedStatuses((current) => ({
                            ...current,
                            [connection.name]: {
                              status: "connected",
                              error: null,
                            },
                          }));
                        } catch (cause) {
                          const message =
                            cause instanceof Error ? cause.message : String(cause);
                          setLmsSavedStatuses((current) => ({
                            ...current,
                            [connection.name]: {
                              status: "error",
                              error: message,
                            },
                          }));
                        }
                      }}
                    >
                      <RefreshCw className="size-3.5 mr-1" />
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowLmsEditor(true);
                        setLmsEditorIndex(index);
                        setLmsDraft(connection);
                        setLmsEditorStatus("idle");
                        setLmsEditorError(null);
                      }}
                    >
                      <Pencil className="size-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRemoveLms(index)}
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {showLmsEditor && (
          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm font-medium">
              {editingLms ? "Edit LMS Connection" : "New LMS Connection"}
            </div>
            <FormField label="Name" htmlFor="settings-lms-name">
              <Input
                id="settings-lms-name"
                value={lmsDraft.name}
                onChange={(event) =>
                  setLmsDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g., Canvas Production"
              />
            </FormField>
            <FormField label="Provider" htmlFor="settings-lms-provider">
              <Select
                value={lmsDraft.provider}
                onValueChange={(value) =>
                  setLmsDraft((current) => ({
                    ...current,
                    provider: value as LmsProviderKind,
                  }))
                }
              >
                <SelectTrigger id="settings-lms-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="canvas">Canvas</SelectItem>
                  <SelectItem value="moodle">Moodle</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Base URL" htmlFor="settings-lms-base-url">
              <Input
                id="settings-lms-base-url"
                value={lmsDraft.baseUrl}
                onChange={(event) =>
                  setLmsDraft((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                  }))
                }
                placeholder="https://canvas.example.edu"
              />
            </FormField>
            <FormField label="Access Token" htmlFor="settings-lms-token">
              <PasswordInput
                id="settings-lms-token"
                value={lmsDraft.token}
                onChange={(event) =>
                  setLmsDraft((current) => ({
                    ...current,
                    token: event.target.value,
                  }))
                }
              />
            </FormField>

            {lmsNameTaken && (
              <Text className="text-xs text-destructive">
                An LMS connection with this name already exists.
              </Text>
            )}
            {lmsEditorError && (
              <Text className="text-xs text-destructive">{lmsEditorError}</Text>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void verifyLms(lmsDraft)}
                disabled={!canSaveLms || lmsEditorStatus === "verifying"}
              >
                {lmsEditorStatus === "verifying" ? (
                  <>
                    <Loader2 className="size-3.5 mr-1 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Check className="size-3.5 mr-1" />
                    Verify
                  </>
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSaveLms()}
                disabled={!canSaveLms}
              >
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={resetLmsEditor}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Git Connections</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowGitEditor(true);
              setGitEditorOriginalName(null);
              setGitDraft(emptyGitDraft());
              setGitEditorStatus("idle");
              setGitEditorError(null);
            }}
            disabled={showGitEditor}
          >
            <Plus className="size-4 mr-1" />
            Add
          </Button>
        </div>

        {gitConnections.length === 0 && !showGitEditor && (
          <Text className="text-sm text-muted-foreground">
            No Git connections configured.
          </Text>
        )}

        <div className="space-y-2">
          {gitConnections.map((connection) => {
            const status = gitSavedStatuses[connection.name] ?? {
              status: "idle" as VerificationStatus,
              error: null,
            };
            return (
              <div key={connection.name} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm">{connection.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {GIT_PROVIDER_LABELS[connection.provider]} ·{" "}
                      {connection.baseUrl ?? "default base URL"}
                      {connection.organization
                        ? ` · org: ${connection.organization}`
                        : ""}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {statusLabel(status.status)}
                    </div>
                    {status.error && (
                      <div className="text-xs text-destructive mt-1">
                        {status.error}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        setGitSavedStatuses((current) => ({
                          ...current,
                          [connection.name]: {
                            status: "verifying",
                            error: null,
                          },
                        }));
                        try {
                          const client = getWorkflowClient();
                          await client.run("connection.verifyGitDraft", {
                            provider: connection.provider,
                            baseUrl: connection.baseUrl,
                            token: connection.token,
                            organization: connection.organization,
                          });
                          setGitSavedStatuses((current) => ({
                            ...current,
                            [connection.name]: {
                              status: "connected",
                              error: null,
                            },
                          }));
                        } catch (cause) {
                          const message =
                            cause instanceof Error ? cause.message : String(cause);
                          setGitSavedStatuses((current) => ({
                            ...current,
                            [connection.name]: {
                              status: "error",
                              error: message,
                            },
                          }));
                        }
                      }}
                    >
                      <RefreshCw className="size-3.5 mr-1" />
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowGitEditor(true);
                        setGitEditorOriginalName(connection.name);
                        setGitDraft(connection);
                        setGitEditorStatus("idle");
                        setGitEditorError(null);
                      }}
                    >
                      <Pencil className="size-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRemoveGit(connection.name)}
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {showGitEditor && (
          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm font-medium">
              {editingGit ? "Edit Git Connection" : "New Git Connection"}
            </div>
            <FormField label="Name" htmlFor="settings-git-name">
              <Input
                id="settings-git-name"
                value={gitDraft.name}
                onChange={(event) =>
                  setGitDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g., Course GitHub"
              />
            </FormField>
            <FormField label="Provider" htmlFor="settings-git-provider">
              <Select
                value={gitDraft.provider}
                onValueChange={(value) =>
                  setGitDraft((current) => ({
                    ...current,
                    provider: value as GitProviderKind,
                  }))
                }
              >
                <SelectTrigger id="settings-git-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="github">GitHub</SelectItem>
                  <SelectItem value="gitlab">GitLab</SelectItem>
                  <SelectItem value="gitea">Gitea</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Base URL (optional)" htmlFor="settings-git-base-url">
              <Input
                id="settings-git-base-url"
                value={gitDraft.baseUrl ?? ""}
                onChange={(event) =>
                  setGitDraft((current) => ({
                    ...current,
                    baseUrl: event.target.value || null,
                  }))
                }
                placeholder="https://git.example.edu"
              />
            </FormField>
            <FormField
              label="Organization (optional)"
              htmlFor="settings-git-organization"
            >
              <Input
                id="settings-git-organization"
                value={gitDraft.organization ?? ""}
                onChange={(event) =>
                  setGitDraft((current) => ({
                    ...current,
                    organization: event.target.value || null,
                  }))
                }
                placeholder="e.g., course-org"
              />
            </FormField>
            <FormField label="Access Token" htmlFor="settings-git-token">
              <PasswordInput
                id="settings-git-token"
                value={gitDraft.token}
                onChange={(event) =>
                  setGitDraft((current) => ({
                    ...current,
                    token: event.target.value,
                  }))
                }
              />
            </FormField>

            {gitNameTaken && (
              <Text className="text-xs text-destructive">
                A Git connection with this name already exists.
              </Text>
            )}
            {gitEditorError && (
              <Text className="text-xs text-destructive">{gitEditorError}</Text>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void verifyGit(gitDraft)}
                disabled={!canSaveGit || gitEditorStatus === "verifying"}
              >
                {gitEditorStatus === "verifying" ? (
                  <>
                    <Loader2 className="size-3.5 mr-1 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Check className="size-3.5 mr-1" />
                    Verify
                  </>
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSaveGit()}
                disabled={!canSaveGit}
              >
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={resetGitEditor}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
