import { useCallback, useEffect, useLayoutEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo-edu/ui";
import { Redo2, Undo2 } from "@repo-edu/ui/components/icons";
import type { WorkflowClient } from "@repo-edu/application-contract";
import type { RendererHost } from "@repo-edu/renderer-host-contract";
import {
  WorkflowClientProvider,
} from "../contexts/workflow-client.js";
import {
  RendererHostProvider,
} from "../contexts/renderer-host.js";
import { useUiStore } from "../stores/ui-store.js";
import { useProfileStore, selectCanUndo, selectCanRedo, selectNextUndoDescription, selectNextRedoDescription } from "../stores/profile-store.js";
import {
  useAppSettingsStore,
  selectTheme,
  selectAppSettingsActiveProfileId,
} from "../stores/app-settings-store.js";
import { useTheme } from "../hooks/use-theme.js";
import { useDirtyState } from "../hooks/use-dirty-state.js";
import { useCloseGuard } from "../hooks/use-close-guard.js";
import { useLoadProfile } from "../hooks/use-load-profile.js";
import { UtilityBar } from "./UtilityBar.js";
import { IssuesButton } from "./IssuesButton.js";
import { SettingsButton } from "./SettingsButton.js";
import { ToastStack } from "./ToastStack.js";
import { RosterTab } from "./tabs/RosterTab.js";
import { GroupsAssignmentsTab } from "./tabs/GroupsAssignmentsTab.js";
import { OperationTab } from "./tabs/OperationTab.js";
import { NewProfileDialog } from "./dialogs/NewProfileDialog.js";
import { NewAssignmentDialog } from "./dialogs/NewAssignmentDialog.js";
import { ConnectLmsGroupSetDialog } from "./dialogs/ConnectLmsGroupSetDialog.js";
import { NewLocalGroupSetDialog } from "./dialogs/NewLocalGroupSetDialog.js";
import { ImportGroupSetDialog } from "./dialogs/ImportGroupSetDialog.js";
import { ReimportGroupSetDialog } from "./dialogs/ReimportGroupSetDialog.js";
import { CopyGroupSetDialog } from "./dialogs/CopyGroupSetDialog.js";
import { DeleteGroupSetDialog } from "./dialogs/DeleteGroupSetDialog.js";
import { DeleteGroupDialog } from "./dialogs/DeleteGroupDialog.js";
import { AddGroupDialog } from "./dialogs/AddGroupDialog.js";
import { RosterSyncDialog } from "./dialogs/RosterSyncDialog.js";
import { ImportStudentsFromFileDialog } from "./dialogs/ImportStudentsFromFileDialog.js";
import { ImportGitUsernamesDialog } from "./dialogs/ImportGitUsernamesDialog.js";
import { UsernameVerificationDialog } from "./dialogs/UsernameVerificationDialog.js";
import { LmsImportConflictDialog } from "./dialogs/LmsImportConflictDialog.js";
import { ValidationDialog } from "./dialogs/ValidationDialog.js";
import { PreflightDialog } from "./dialogs/PreflightDialog.js";
import { SettingsSheet } from "./settings/SettingsSheet.js";
import { IssuesSheet } from "./sheets/IssuesSheet.js";
import { FileImportExportSheet } from "./sheets/FileImportExportSheet.js";
import type { ActiveTab } from "../types/index.js";
import { configureApp } from "../configure-app.js";

export type AppRootProps = {
  workflowClient: WorkflowClient;
  rendererHost: RendererHost;
};

export function AppRoot({ workflowClient, rendererHost }: AppRootProps) {
  useLayoutEffect(() => {
    return configureApp({ workflowClient, rendererHost });
  }, [workflowClient, rendererHost]);

  return (
    <WorkflowClientProvider value={workflowClient}>
      <RendererHostProvider value={rendererHost}>
        <TooltipProvider>
          <AppShell />
        </TooltipProvider>
      </RendererHostProvider>
    </WorkflowClientProvider>
  );
}

function AppShell() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const activeProfileId = useUiStore((s) => s.activeProfileId);
  const closePromptVisible = useUiStore((s) => s.closePromptVisible);
  const showClosePrompt = useUiStore((s) => s.showClosePrompt);
  const hideClosePrompt = useUiStore((s) => s.hideClosePrompt);

  const theme = useAppSettingsStore(selectTheme);
  const appSettingsActiveProfileId = useAppSettingsStore(
    selectAppSettingsActiveProfileId,
  );
  const loadAppSettings = useAppSettingsStore((s) => s.load);

  const canUndo = useProfileStore(selectCanUndo);
  const canRedo = useProfileStore(selectCanRedo);
  const undoDescription = useProfileStore(selectNextUndoDescription);
  const redoDescription = useProfileStore(selectNextRedoDescription);
  const undo = useProfileStore((s) => s.undo);
  const redo = useProfileStore((s) => s.redo);
  const saveProfile = useProfileStore((s) => s.save);

  // Load app settings on mount.
  useEffect(() => {
    void loadAppSettings();
  }, [loadAppSettings]);

  // Restore active profile from app settings after settings load.
  useEffect(() => {
    if (!activeProfileId && appSettingsActiveProfileId) {
      setActiveTab("roster");
      useUiStore.getState().setActiveProfileId(appSettingsActiveProfileId);
    }
  }, [activeProfileId, appSettingsActiveProfileId, setActiveTab]);

  // Apply theme.
  useTheme(theme);

  // Load profile when activeProfileId changes.
  useLoadProfile(activeProfileId);

  // Dirty state tracking.
  const { isDirty, markClean } = useDirtyState(activeProfileId);

  const handleSave = useCallback(async () => {
    const success = await saveProfile();
    if (success) markClean();
  }, [saveProfile, markClean]);

  // Close guard.
  const { handlePromptSave, handlePromptDiscard, handlePromptCancel } =
    useCloseGuard({
      isDirty,
      onShowPrompt: showClosePrompt,
      onHidePrompt: hideClosePrompt,
      onSave: handleSave,
    });

  // Keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "s") {
        e.preventDefault();
        void handleSave();
        return;
      }

      if (e.key === ",") {
        e.preventDefault();
        useUiStore.getState().openSettings();
        return;
      }

      // Skip undo/redo when focus is in an input or textarea.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if ((e.key === "z" && e.shiftKey) || e.key === "Z") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, undo, redo]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ActiveTab)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        {/* Header bar */}
        <div className="flex items-center border-b">
          <TabsList>
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="groups-assignments">
              Groups &amp; Assignments
            </TabsTrigger>
            <TabsTrigger value="operation">Operation</TabsTrigger>
          </TabsList>
          <div className="flex-1" />
          <div className="flex items-center gap-1 pr-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={!canUndo}
                  onClick={() => undo()}
                >
                  <Undo2 className="size-4" />
                  <span className="sr-only">Undo</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {undoDescription
                  ? `Undo: ${undoDescription} (Ctrl+Z)`
                  : "Undo (Ctrl+Z)"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={!canRedo}
                  onClick={() => redo()}
                >
                  <Redo2 className="size-4" />
                  <span className="sr-only">Redo</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {redoDescription
                  ? `Redo: ${redoDescription} (Ctrl+Shift+Z)`
                  : "Redo (Ctrl+Shift+Z)"}
              </TooltipContent>
            </Tooltip>
            <IssuesButton />
            <SettingsButton />
          </div>
        </div>

        {/* Tab content */}
        <TabsContent value="roster" className="flex-1 overflow-auto">
          <RosterTab isDirty={isDirty} />
        </TabsContent>
        <TabsContent
          value="groups-assignments"
          className="flex-1 overflow-auto"
        >
          <GroupsAssignmentsTab />
        </TabsContent>
        <TabsContent value="operation" className="flex-1 overflow-auto">
          <OperationTab />
        </TabsContent>
      </Tabs>

      <UtilityBar isDirty={isDirty} onSaved={markClean} />

      {/* Unsaved changes prompt */}
      <AlertDialog
        open={closePromptVisible}
        onOpenChange={(open) => {
          if (!open) hideClosePrompt();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Do you want to save before closing?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handlePromptCancel}>
              Cancel
            </AlertDialogCancel>
            <Button variant="outline" onClick={() => void handlePromptDiscard()}>
              Discard
            </Button>
            <AlertDialogAction onClick={() => void handlePromptSave()}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assignment and group dialogs */}
      <NewAssignmentDialog />
      <ConnectLmsGroupSetDialog />
      <NewLocalGroupSetDialog />
      <ImportGroupSetDialog />
      <ReimportGroupSetDialog />
      <CopyGroupSetDialog />
      <DeleteGroupSetDialog />
      <DeleteGroupDialog />
      <AddGroupDialog />

      {/* Operation dialogs */}
      <ValidationDialog />
      <PreflightDialog />

      {/* Profile and roster dialogs */}
      <NewProfileDialog />
      <RosterSyncDialog />
      <ImportStudentsFromFileDialog />
      <ImportGitUsernamesDialog />
      <UsernameVerificationDialog />
      <LmsImportConflictDialog />

      {/* Sheets */}
      <FileImportExportSheet />
      <IssuesSheet />
      <SettingsSheet />

      <ToastStack />
    </div>
  );
}
