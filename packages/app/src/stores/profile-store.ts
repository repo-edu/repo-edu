import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enablePatches, produceWithPatches, applyPatches } from "immer";
import type { Patch } from "immer";
import type {
  Assignment,
  GitIdentityMode,
  Group,
  GroupOrigin,
  GroupSelectionMode,
  GroupSet,
  GroupSetConnection,
  PersistedProfile,
  Roster,
  RosterMember,
  RosterValidationResult,
} from "@repo-edu/domain";
import {
  ensureSystemGroupSets,
  normalizeRoster,
  validateAssignment,
  validateRoster,
  persistedProfileKind,
} from "@repo-edu/domain";
import { getWorkflowClient } from "../contexts/workflow-client.js";
import { useToastStore } from "./toast-store.js";
import { buildIssueCards } from "../utils/issues.js";
import type { IssueCard, ChecksStatus, DocumentStatus } from "../types/index.js";
import { generateGroupId, generateGroupSetId } from "../utils/nanoid.js";

enablePatches();

const HISTORY_LIMIT = 100;

type HistoryEntry = {
  patches: Patch[];
  inversePatches: Patch[];
  description: string;
};

type ProfileState = {
  profile: PersistedProfile | null;
  status: DocumentStatus;
  error: string | null;
  warnings: string[];

  assignmentSelection: string | null;
  systemSetsReady: boolean;

  rosterValidation: RosterValidationResult | null;
  assignmentValidations: Record<string, RosterValidationResult>;
  issueCards: IssueCard[];
  checksStatus: ChecksStatus;
  checksError: string | null;
  checksDirty: boolean;

  history: HistoryEntry[];
  future: HistoryEntry[];
};

type ProfileActions = {
  load: (profileId: string) => Promise<void>;
  save: () => Promise<boolean>;
  clear: () => void;

  // Roster mutations (with undo history)
  addMember: (member: RosterMember) => void;
  updateMember: (id: string, updates: Partial<RosterMember>) => void;
  removeMember: (id: string) => void;
  deleteMemberPermanently: (id: string) => void;
  setRoster: (roster: Roster, description?: string) => void;

  // Assignment CRUD
  addAssignment: (assignment: Assignment) => void;
  updateAssignment: (id: string, updates: Partial<Assignment>) => void;
  deleteAssignment: (id: string) => void;
  setAssignmentSelection: (id: string | null) => void;

  // Group CRUD
  createGroup: (
    groupSetId: string,
    name: string,
    memberIds: string[],
  ) => string | null;
  updateGroup: (groupId: string, updates: Partial<Group>) => void;
  deleteGroup: (groupId: string) => void;
  moveMemberToGroup: (
    memberId: string,
    sourceGroupId: string,
    targetGroupId: string,
  ) => void;
  copyMemberToGroup: (memberId: string, targetGroupId: string) => void;

  // Group set CRUD
  createLocalGroupSet: (name: string, groupIds?: string[]) => string | null;
  copyGroupSet: (groupSetId: string) => string | null;
  renameGroupSet: (groupSetId: string, name: string) => void;
  deleteGroupSet: (groupSetId: string) => void;
  removeGroupFromSet: (groupSetId: string, groupId: string) => void;
  updateGroupSetSelection: (
    groupSetId: string,
    selection: GroupSelectionMode,
  ) => void;

  // Profile metadata
  setCourseId: (courseId: string | null) => void;
  setLmsConnectionName: (name: string | null) => void;
  setGitConnectionName: (name: string | null) => void;
  setRepositoryTemplate: (
    template: PersistedProfile["repositoryTemplate"],
  ) => void;
  setDisplayName: (name: string) => void;

  // System sets
  ensureSystemGroupSets: () => void;

  // Validation
  runChecks: (identityMode: GitIdentityMode) => void;

  // Undo/redo
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  clearHistory: () => void;
};

const initialState: ProfileState = {
  profile: null,
  status: "empty",
  error: null,
  warnings: [],
  assignmentSelection: null,
  systemSetsReady: false,
  rosterValidation: null,
  assignmentValidations: {},
  issueCards: [],
  checksStatus: "idle",
  checksError: null,
  checksDirty: false,
  history: [],
  future: [],
};

export const useProfileStore = create<ProfileState & ProfileActions>()(
  immer((set, get) => {
    /** Apply a roster mutation with undo/redo history tracking. */
    function mutateRoster(
      description: string,
      mutator: (roster: Roster) => void,
    ) {
      const state = get();
      if (!state.profile) return;

      const [nextRoster, patches, inversePatches] = produceWithPatches(
        state.profile.roster,
        mutator,
      );

      if (patches.length === 0) return;

      set((draft) => {
        if (!draft.profile) return;
        draft.profile.roster = nextRoster as Roster;
        draft.profile.updatedAt = new Date().toISOString();
        draft.history.push({ patches, inversePatches, description });
        if (draft.history.length > HISTORY_LIMIT) {
          draft.history.splice(0, draft.history.length - HISTORY_LIMIT);
        }
        draft.future = [];
        draft.checksDirty = true;
      });
    }

    return {
      ...initialState,

      load: async (profileId) => {
        try {
          set((draft) => {
            draft.status = "loading";
            draft.error = null;
          });
          const client = getWorkflowClient();
          const loaded = await client.run("profile.load", { profileId });
          set((draft) => {
            draft.profile = loaded as PersistedProfile;
            draft.status = "loaded";
            draft.history = [];
            draft.future = [];
            draft.assignmentSelection = null;
            draft.checksDirty = true;
            draft.systemSetsReady = false;
          });
        } catch (err) {
          set((draft) => {
            draft.status = "error";
            draft.error =
              err instanceof Error ? err.message : String(err);
          });
        }
      },

      save: async () => {
        const state = get();
        if (!state.profile) return false;
        try {
          const client = getWorkflowClient();
          const saved = await client.run("profile.save", state.profile);
          set((draft) => {
            draft.profile = saved as PersistedProfile;
          });
          return true;
        } catch (err) {
          useToastStore.getState().addToast(
            err instanceof Error ? err.message : "Save failed",
            { tone: "error" },
          );
          return false;
        }
      },

      clear: () => set(initialState),

      // ------------------------------------------------------------------
      // Member mutations
      // ------------------------------------------------------------------

      addMember: (member) => {
        mutateRoster(`Add ${member.name}`, (roster) => {
          if (member.enrollmentType === "student") {
            roster.students.push(member);
          } else {
            roster.staff.push(member);
          }
        });
      },

      updateMember: (id, updates) => {
        mutateRoster("Update member", (roster) => {
          const allMembers = [...roster.students, ...roster.staff];
          const member = allMembers.find((m) => m.id === id);
          if (member) Object.assign(member, updates);
        });
      },

      removeMember: (id) => {
        mutateRoster("Remove member", (roster) => {
          const student = roster.students.find((m) => m.id === id);
          if (student) {
            student.status = "dropped";
            return;
          }
          const staff = roster.staff.find((m) => m.id === id);
          if (staff) {
            staff.status = "dropped";
          }
        });
      },

      deleteMemberPermanently: (id) => {
        mutateRoster("Delete member permanently", (roster) => {
          roster.students = roster.students.filter((m) => m.id !== id);
          roster.staff = roster.staff.filter((m) => m.id !== id);
          for (const group of roster.groups) {
            group.memberIds = group.memberIds.filter((mid) => mid !== id);
          }
        });
      },

      setRoster: (roster, description) => {
        mutateRoster(description ?? "Replace roster", () => {
          // The `mutateRoster` only records patches on the existing roster.
          // For a full replacement we need to use set() directly.
        });
        // Full replacement bypasses the inner mutator and applies directly.
        set((draft) => {
          if (!draft.profile) return;
          const [nextRoster, patches, inversePatches] = produceWithPatches(
            draft.profile.roster,
            () => roster,
          );
          if (patches.length === 0) return;
          draft.profile.roster = nextRoster as Roster;
          draft.profile.updatedAt = new Date().toISOString();
          draft.history.push({
            patches,
            inversePatches,
            description: description ?? "Replace roster",
          });
          if (draft.history.length > HISTORY_LIMIT) {
            draft.history.splice(0, draft.history.length - HISTORY_LIMIT);
          }
          draft.future = [];
          draft.checksDirty = true;
        });
      },

      // ------------------------------------------------------------------
      // Assignment CRUD
      // ------------------------------------------------------------------

      addAssignment: (assignment) => {
        mutateRoster(`Add assignment "${assignment.name}"`, (roster) => {
          roster.assignments.push(assignment);
        });
      },

      updateAssignment: (id, updates) => {
        mutateRoster("Update assignment", (roster) => {
          const assignment = roster.assignments.find((a) => a.id === id);
          if (assignment) Object.assign(assignment, updates);
        });
      },

      deleteAssignment: (id) => {
        mutateRoster("Delete assignment", (roster) => {
          roster.assignments = roster.assignments.filter((a) => a.id !== id);
        });
        set((draft) => {
          if (draft.assignmentSelection === id) {
            draft.assignmentSelection = null;
          }
        });
      },

      setAssignmentSelection: (id) => {
        set((draft) => {
          draft.assignmentSelection = id;
        });
      },

      // ------------------------------------------------------------------
      // Group CRUD
      // ------------------------------------------------------------------

      createGroup: (groupSetId, name, memberIds) => {
        const id = generateGroupId();
        mutateRoster(`Create group "${name}"`, (roster) => {
          const group: Group = {
            id,
            name,
            memberIds,
            origin: "local",
            lmsGroupId: null,
          };
          roster.groups.push(group);
          const groupSet = roster.groupSets.find(
            (gs) => gs.id === groupSetId,
          );
          if (groupSet) {
            groupSet.groupIds.push(id);
          }
        });
        return id;
      },

      updateGroup: (groupId, updates) => {
        mutateRoster("Update group", (roster) => {
          const group = roster.groups.find((g) => g.id === groupId);
          if (group && group.origin === "local") {
            Object.assign(group, updates);
          }
        });
      },

      deleteGroup: (groupId) => {
        mutateRoster("Delete group", (roster) => {
          roster.groups = roster.groups.filter((g) => g.id !== groupId);
          for (const gs of roster.groupSets) {
            gs.groupIds = gs.groupIds.filter((gid) => gid !== groupId);
          }
        });
      },

      moveMemberToGroup: (memberId, sourceGroupId, targetGroupId) => {
        mutateRoster("Move member", (roster) => {
          const source = roster.groups.find((g) => g.id === sourceGroupId);
          const target = roster.groups.find((g) => g.id === targetGroupId);
          if (source && target) {
            source.memberIds = source.memberIds.filter(
              (id) => id !== memberId,
            );
            if (!target.memberIds.includes(memberId)) {
              target.memberIds.push(memberId);
            }
          }
        });
      },

      copyMemberToGroup: (memberId, targetGroupId) => {
        mutateRoster("Copy member to group", (roster) => {
          const target = roster.groups.find((g) => g.id === targetGroupId);
          if (target && !target.memberIds.includes(memberId)) {
            target.memberIds.push(memberId);
          }
        });
      },

      // ------------------------------------------------------------------
      // Group set CRUD
      // ------------------------------------------------------------------

      createLocalGroupSet: (name, groupIds) => {
        const id = generateGroupSetId();
        mutateRoster(`Create group set "${name}"`, (roster) => {
          const groupSet: GroupSet = {
            id,
            name,
            groupIds: groupIds ?? [],
            connection: null,
            groupSelection: { kind: "all", excludedGroupIds: [] },
          };
          roster.groupSets.push(groupSet);
        });
        return id;
      },

      copyGroupSet: (groupSetId) => {
        const state = get();
        if (!state.profile) return null;
        const source = state.profile.roster.groupSets.find(
          (gs) => gs.id === groupSetId,
        );
        if (!source) return null;

        const newId = generateGroupSetId();
        const copiedGroupIds: string[] = [];

        mutateRoster(`Copy group set "${source.name}"`, (roster) => {
          for (const origGroupId of source.groupIds) {
            const origGroup = roster.groups.find(
              (g) => g.id === origGroupId,
            );
            if (!origGroup) continue;
            const newGroupId = generateGroupId();
            copiedGroupIds.push(newGroupId);
            roster.groups.push({
              id: newGroupId,
              name: origGroup.name,
              memberIds: [...origGroup.memberIds],
              origin: "local",
              lmsGroupId: null,
            });
          }

          roster.groupSets.push({
            id: newId,
            name: `${source.name} (copy)`,
            groupIds: copiedGroupIds,
            connection: null,
            groupSelection: { kind: "all", excludedGroupIds: [] },
          });
        });

        return newId;
      },

      renameGroupSet: (groupSetId, name) => {
        mutateRoster(`Rename group set to "${name}"`, (roster) => {
          const gs = roster.groupSets.find((g) => g.id === groupSetId);
          if (gs && gs.connection?.kind !== "system") {
            gs.name = name;
          }
        });
      },

      deleteGroupSet: (groupSetId) => {
        mutateRoster("Delete group set", (roster) => {
          const gs = roster.groupSets.find((g) => g.id === groupSetId);
          if (!gs || gs.connection?.kind === "system") return;

          // Remove assignments that reference this group set.
          roster.assignments = roster.assignments.filter(
            (a) => a.groupSetId !== groupSetId,
          );

          // Remove the group set.
          roster.groupSets = roster.groupSets.filter(
            (g) => g.id !== groupSetId,
          );

          // Remove orphaned groups that are no longer in any group set.
          const referencedGroupIds = new Set(
            roster.groupSets.flatMap((g) => g.groupIds),
          );
          roster.groups = roster.groups.filter((g) =>
            referencedGroupIds.has(g.id),
          );
        });
      },

      removeGroupFromSet: (groupSetId, groupId) => {
        mutateRoster("Remove group from set", (roster) => {
          const gs = roster.groupSets.find((g) => g.id === groupSetId);
          if (gs) {
            gs.groupIds = gs.groupIds.filter((id) => id !== groupId);
          }
        });
      },

      updateGroupSetSelection: (groupSetId, selection) => {
        mutateRoster("Update group set selection", (roster) => {
          const gs = roster.groupSets.find((g) => g.id === groupSetId);
          if (gs) gs.groupSelection = selection;
        });
      },

      // ------------------------------------------------------------------
      // Profile metadata (non-roster, no undo)
      // ------------------------------------------------------------------

      setCourseId: (courseId) => {
        set((draft) => {
          if (draft.profile) draft.profile.courseId = courseId;
        });
      },

      setLmsConnectionName: (name) => {
        set((draft) => {
          if (draft.profile) draft.profile.lmsConnectionName = name;
        });
      },

      setGitConnectionName: (name) => {
        set((draft) => {
          if (draft.profile) draft.profile.gitConnectionName = name;
        });
      },

      setRepositoryTemplate: (template) => {
        set((draft) => {
          if (draft.profile) draft.profile.repositoryTemplate = template;
        });
      },

      setDisplayName: (name) => {
        set((draft) => {
          if (draft.profile) draft.profile.displayName = name;
        });
      },

      // ------------------------------------------------------------------
      // System group sets
      // ------------------------------------------------------------------

      ensureSystemGroupSets: () => {
        const state = get();
        if (!state.profile) return;
        const result = ensureSystemGroupSets(state.profile.roster);

        const hasChanges =
          result.groupsUpserted.length > 0 ||
          result.deletedGroupIds.length > 0;

        if (!hasChanges) {
          set((draft) => {
            draft.systemSetsReady = true;
          });
          return;
        }

        set((draft) => {
          if (!draft.profile) return;
          const roster = draft.profile.roster;

          // Apply upserted groups.
          const upsertedIds = new Set(
            result.groupsUpserted.map((g) => g.id),
          );
          roster.groups = roster.groups.filter(
            (g) => !upsertedIds.has(g.id),
          );
          roster.groups.push(
            ...(result.groupsUpserted as Group[]),
          );

          // Remove deleted groups.
          const deletedIds = new Set(result.deletedGroupIds);
          roster.groups = roster.groups.filter(
            (g) => !deletedIds.has(g.id),
          );

          // Upsert system group sets.
          const systemSetIds = new Set(
            result.groupSets.map((gs) => gs.id),
          );
          roster.groupSets = roster.groupSets.filter(
            (gs) => !systemSetIds.has(gs.id),
          );
          roster.groupSets.push(
            ...(result.groupSets as GroupSet[]),
          );

          draft.profile.updatedAt = new Date().toISOString();
          draft.systemSetsReady = true;
          draft.checksDirty = true;
        });
      },

      // ------------------------------------------------------------------
      // Validation
      // ------------------------------------------------------------------

      runChecks: (identityMode) => {
        const state = get();
        if (!state.profile) return;
        const roster = state.profile.roster;

        set((draft) => {
          draft.checksStatus = "running";
          draft.checksError = null;
        });

        try {
          const rosterResult = validateRoster(roster);
          const assignmentResults: Record<string, RosterValidationResult> =
            {};
          for (const assignment of roster.assignments) {
            assignmentResults[assignment.id] = validateAssignment(
              roster,
              assignment.id,
              identityMode,
            );
          }

          const cards = buildIssueCards(
            roster,
            rosterResult,
            assignmentResults,
          );

          set((draft) => {
            draft.rosterValidation = rosterResult;
            draft.assignmentValidations = assignmentResults;
            draft.issueCards = cards;
            draft.checksStatus = "ready";
            draft.checksDirty = false;
          });
        } catch (err) {
          set((draft) => {
            draft.checksStatus = "error";
            draft.checksError =
              err instanceof Error ? err.message : String(err);
          });
        }
      },

      // ------------------------------------------------------------------
      // Undo / Redo
      // ------------------------------------------------------------------

      undo: () => {
        const state = get();
        if (state.history.length === 0 || !state.profile) return null;
        const entry = state.history[state.history.length - 1];
        const nextRoster = applyPatches(
          state.profile.roster,
          entry.inversePatches,
        );
        set((draft) => {
          if (!draft.profile) return;
          draft.profile.roster = nextRoster as Roster;
          draft.profile.updatedAt = new Date().toISOString();
          draft.history.pop();
          draft.future.push(entry);
          draft.checksDirty = true;
        });
        return entry;
      },

      redo: () => {
        const state = get();
        if (state.future.length === 0 || !state.profile) return null;
        const entry = state.future[state.future.length - 1];
        const nextRoster = applyPatches(
          state.profile.roster,
          entry.patches,
        );
        set((draft) => {
          if (!draft.profile) return;
          draft.profile.roster = nextRoster as Roster;
          draft.profile.updatedAt = new Date().toISOString();
          draft.future.pop();
          draft.history.push(entry);
          draft.checksDirty = true;
        });
        return entry;
      },

      clearHistory: () => {
        set((draft) => {
          draft.history = [];
          draft.future = [];
        });
      },
    };
  }),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectProfile = (state: ProfileState) => state.profile;
export const selectRoster = (state: ProfileState) =>
  state.profile?.roster ?? null;
export const selectProfileStatus = (state: ProfileState) => state.status;
export const selectProfileError = (state: ProfileState) => state.error;
export const selectProfileWarnings = (state: ProfileState) => state.warnings;

const EMPTY_MEMBERS: RosterMember[] = [];
const EMPTY_GROUPS: Group[] = [];
const EMPTY_GROUP_SETS: GroupSet[] = [];
const EMPTY_ASSIGNMENTS: Assignment[] = [];
const EMPTY_EDITABLE_GROUP_TARGETS: EditableGroupTarget[] = [];
const EMPTY_NAMES: string[] = [];

export const selectStudents = (state: ProfileState) =>
  state.profile?.roster.students ?? EMPTY_MEMBERS;
export const selectStaff = (state: ProfileState) =>
  state.profile?.roster.staff ?? EMPTY_MEMBERS;
export const selectGroups = (state: ProfileState) =>
  state.profile?.roster.groups ?? EMPTY_GROUPS;
export const selectGroupSets = (state: ProfileState) =>
  state.profile?.roster.groupSets ?? EMPTY_GROUP_SETS;
export const selectAssignments = (state: ProfileState) =>
  state.profile?.roster.assignments ?? EMPTY_ASSIGNMENTS;
export const selectAssignmentSelection = (state: ProfileState) =>
  state.assignmentSelection;

export const selectGroupById =
  (groupId: string) => (state: ProfileState) =>
    state.profile?.roster.groups.find((g) => g.id === groupId) ?? null;
export const selectGroupSetById =
  (groupSetId: string) => (state: ProfileState) =>
    state.profile?.roster.groupSets.find((gs) => gs.id === groupSetId) ??
    null;
export const selectAssignmentById =
  (assignmentId: string) => (state: ProfileState) =>
    state.profile?.roster.assignments.find((a) => a.id === assignmentId) ??
    null;

export const selectCourseId = (state: ProfileState) =>
  state.profile?.courseId ?? null;
export const selectGitConnectionName = (state: ProfileState) =>
  state.profile?.gitConnectionName ?? null;
export const selectLmsConnectionName = (state: ProfileState) =>
  state.profile?.lmsConnectionName ?? null;
export const selectRepositoryTemplate = (state: ProfileState) =>
  state.profile?.repositoryTemplate ?? null;

export const selectSystemSetsReady = (state: ProfileState) =>
  state.systemSetsReady;
export const selectRosterValidation = (state: ProfileState) =>
  state.rosterValidation;
export const selectAssignmentValidations = (state: ProfileState) =>
  state.assignmentValidations;
export const selectIssueCards = (state: ProfileState) => state.issueCards;
export const selectChecksStatus = (state: ProfileState) => state.checksStatus;
export const selectChecksError = (state: ProfileState) => state.checksError;
export const selectChecksDirty = (state: ProfileState) => state.checksDirty;

// Group set category selectors

let cachedSystemGroupSetsRoster: Roster | null = null;
let cachedSystemGroupSets: GroupSet[] = EMPTY_GROUP_SETS;

export const selectSystemGroupSets = (state: ProfileState) => {
  const roster = state.profile?.roster ?? null;
  if (!roster) {
    cachedSystemGroupSetsRoster = null;
    cachedSystemGroupSets = EMPTY_GROUP_SETS;
    return EMPTY_GROUP_SETS;
  }
  if (cachedSystemGroupSetsRoster === roster) {
    return cachedSystemGroupSets;
  }
  cachedSystemGroupSetsRoster = roster;
  cachedSystemGroupSets = roster.groupSets.filter(
    (gs) => gs.connection?.kind === "system",
  );
  return cachedSystemGroupSets;
};

export const selectSystemGroupSet =
  (systemType: string) => (state: ProfileState) =>
    (state.profile?.roster.groupSets ?? []).find(
      (gs) =>
        gs.connection?.kind === "system" &&
        gs.connection.systemType === systemType,
    ) ?? null;

let cachedConnectedGroupSetsRoster: Roster | null = null;
let cachedConnectedGroupSets: GroupSet[] = EMPTY_GROUP_SETS;

export const selectConnectedGroupSets = (state: ProfileState) => {
  const roster = state.profile?.roster ?? null;
  if (!roster) {
    cachedConnectedGroupSetsRoster = null;
    cachedConnectedGroupSets = EMPTY_GROUP_SETS;
    return EMPTY_GROUP_SETS;
  }
  if (cachedConnectedGroupSetsRoster === roster) {
    return cachedConnectedGroupSets;
  }
  cachedConnectedGroupSetsRoster = roster;
  cachedConnectedGroupSets = roster.groupSets.filter(
    (gs) =>
      gs.connection?.kind === "canvas" || gs.connection?.kind === "moodle",
  );
  return cachedConnectedGroupSets;
};

let cachedLocalGroupSetsRoster: Roster | null = null;
let cachedLocalGroupSets: GroupSet[] = EMPTY_GROUP_SETS;

export const selectLocalGroupSets = (state: ProfileState) => {
  const roster = state.profile?.roster ?? null;
  if (!roster) {
    cachedLocalGroupSetsRoster = null;
    cachedLocalGroupSets = EMPTY_GROUP_SETS;
    return EMPTY_GROUP_SETS;
  }
  if (cachedLocalGroupSetsRoster === roster) {
    return cachedLocalGroupSets;
  }
  cachedLocalGroupSetsRoster = roster;
  cachedLocalGroupSets = roster.groupSets.filter(
    (gs) => gs.connection === null || gs.connection.kind === "import",
  );
  return cachedLocalGroupSets;
};

export const selectGroupsForGroupSet = (groupSetId: string) => {
  let cachedRoster: Roster | null = null;
  let cachedValue: Group[] = EMPTY_GROUPS;

  return (state: ProfileState) => {
    const roster = state.profile?.roster ?? null;
    if (!roster) {
      cachedRoster = null;
      cachedValue = EMPTY_GROUPS;
      return EMPTY_GROUPS;
    }
    if (cachedRoster === roster) {
      return cachedValue;
    }

    const groupSet = roster.groupSets.find((candidate) => candidate.id === groupSetId);
    if (!groupSet) {
      cachedRoster = roster;
      cachedValue = EMPTY_GROUPS;
      return EMPTY_GROUPS;
    }

    const groupIds = new Set(groupSet.groupIds);
    cachedRoster = roster;
    cachedValue = roster.groups.filter((group) => groupIds.has(group.id));
    return cachedValue;
  };
};

export const selectAssignmentsForGroupSet = (groupSetId: string) => {
  let cachedRoster: Roster | null = null;
  let cachedValue: Assignment[] = EMPTY_ASSIGNMENTS;

  return (state: ProfileState) => {
    const roster = state.profile?.roster ?? null;
    if (!roster) {
      cachedRoster = null;
      cachedValue = EMPTY_ASSIGNMENTS;
      return EMPTY_ASSIGNMENTS;
    }
    if (cachedRoster === roster) {
      return cachedValue;
    }

    cachedRoster = roster;
    cachedValue = roster.assignments.filter(
      (assignment) => assignment.groupSetId === groupSetId,
    );
    return cachedValue;
  };
};

/** All (groupSetId, group[]) pairs for editable (local) group sets. */
export type EditableGroupTarget = {
  groupSetId: string;
  groupSetName: string;
  groups: { id: string; name: string }[];
};

let cachedEditableTargetsRoster: Roster | null = null;
let cachedEditableTargets: EditableGroupTarget[] = EMPTY_EDITABLE_GROUP_TARGETS;

export const selectEditableGroupTargets = (state: ProfileState): EditableGroupTarget[] => {
  const roster = state.profile?.roster;
  if (!roster) {
    cachedEditableTargetsRoster = null;
    cachedEditableTargets = EMPTY_EDITABLE_GROUP_TARGETS;
    return EMPTY_EDITABLE_GROUP_TARGETS;
  }
  if (cachedEditableTargetsRoster === roster) {
    return cachedEditableTargets;
  }

  cachedEditableTargetsRoster = roster;
  cachedEditableTargets = roster.groupSets
    .filter((gs) => gs.connection === null || gs.connection.kind === "import")
    .map((gs) => ({
      groupSetId: gs.id,
      groupSetName: gs.name,
      groups: gs.groupIds
        .map((gid) => roster.groups.find((g) => g.id === gid))
        .filter((g): g is Group => g !== undefined && g.origin === "local")
        .map((g) => ({ id: g.id, name: g.name })),
    }));
  return cachedEditableTargets;
};

export const selectOtherGroupSetNames =
  (groupId: string, currentGroupSetId: string) => {
    let cachedRoster: Roster | null = null;
    let cachedValue: string[] = EMPTY_NAMES;

    return (state: ProfileState): string[] => {
      const roster = state.profile?.roster ?? null;
      if (!roster) {
        cachedRoster = null;
        cachedValue = EMPTY_NAMES;
        return EMPTY_NAMES;
      }
      if (cachedRoster === roster) {
        return cachedValue;
      }

      cachedRoster = roster;
      cachedValue = roster.groupSets
        .filter(
          (groupSet) =>
            groupSet.id !== currentGroupSetId &&
            groupSet.groupIds.includes(groupId),
        )
        .map((groupSet) => groupSet.name);
      return cachedValue;
    };
  };

export const selectGroupReferenceCount =
  (groupId: string) => (state: ProfileState) => {
    const roster = state.profile?.roster;
    if (!roster) return 0;
    return roster.groupSets.filter((gs) =>
      gs.groupIds.includes(groupId),
    ).length;
  };

export const selectCanUndo = (state: ProfileState) =>
  state.history.length > 0;
export const selectCanRedo = (state: ProfileState) =>
  state.future.length > 0;
export const selectNextUndoDescription = (state: ProfileState) =>
  state.history.length > 0
    ? state.history[state.history.length - 1].description
    : null;
export const selectNextRedoDescription = (state: ProfileState) =>
  state.future.length > 0
    ? state.future[state.future.length - 1].description
    : null;
