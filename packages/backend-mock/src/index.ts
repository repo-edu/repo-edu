import type { BackendAPI } from "@repo-edu/backend-interface";
import type { 
  AppError, 
  Result, 
  ProfileSettings, 
  Roster, 
  AppSettings,
  CourseInfo
} from "@repo-edu/backend-interface/types";

export class MockBackend implements BackendAPI {
  private profiles = new Map<string, ProfileSettings>();
  private rosters = new Map<string, Roster>();
  private activeProfile: string | null = "Demo Profile";
  private appSettings: AppSettings = {
    theme: "system",
    date_format: "YYYY-MM-DD",
    time_format: "24h",
    git_connections: {},
  };

  constructor() {
    // Initialize with some demo data
    const demoProfile: CourseInfo = { id: "101", name: "Demo Course" };
    // This is a simplification; in a real mock we'd have full default settings
  }

  // --- Helper to wrap success ---
  private ok<T>(data: T): Promise<Result<T, AppError>> {
    return Promise.resolve({ status: "ok", data });
  }

  // --- Implementation of BackendAPI ---

  async listProfiles(): Promise<Result<string[], AppError>> {
    return this.ok(Array.from(this.profiles.keys()));
  }

  async getActiveProfile(): Promise<Result<string | null, AppError>> {
    return this.ok(this.activeProfile);
  }

  async setActiveProfile(name: string): Promise<Result<null, AppError>> {
    this.activeProfile = name;
    return this.ok(null);
  }

  async loadAppSettings(): Promise<Result<AppSettings, AppError>> {
    return this.ok(this.appSettings);
  }

  async saveAppSettings(settings: AppSettings): Promise<Result<null, AppError>> {
    this.appSettings = settings;
    return this.ok(null);
  }

  // Fallback for all other methods
  // Note: In a real implementation, we would implement all methods.
  // For this initial setup, we'll use a Proxy or just add stubs as needed.
  // Since TypeScript will complain if we don't implement everything, 
  // I will add a list of stubs.
  
  // LMS Commands
  async getTokenInstructions(_: string) { return this.ok("Mock instructions"); }
  async openTokenUrl(_: string, __: string) { return this.ok(null); }
  async verifyLmsCourse(_: any) { return this.ok({ course_id: "101", course_name: "Mock Course" }); }
  async generateLmsFiles(_: any, progress: any) { 
    progress.send("Mock progress: 50%");
    return this.ok({ success: true, message: "Done", details: null }); 
  }
  async getGroupCategories(_: any) { return this.ok([]); }
  async verifyLmsConnection(_: any) { return this.ok({ success: true, message: "Verified" } as any); }
  async verifyLmsConnectionDraft(_: any) { return this.ok({ success: true, message: "Verified" } as any); }
  async fetchLmsCourses() { return this.ok([]); }
  async fetchLmsCoursesDraft(_: any) { return this.ok([]); }
  async importStudentsFromLms(_: any, __: any) { return this.ok({ students_added: 0, students_updated: 0, errors: [] } as any); }
  async importStudentsFromFile(_: any, __: any, ___: any) { return this.ok({ students_added: 0, students_updated: 0, errors: [] } as any); }
  async fetchLmsGroupSets(_: any) { return this.ok([]); }
  async fetchLmsGroupSetList(_: any) { return this.ok([]); }
  async fetchLmsGroupsForSet(_: any, __: any) { return this.ok([]); }
  async importGroupsFromLms(_: any, __: any, ___: any, ____: any) { return this.ok({ groups_added: 0, assignments_updated: 0 } as any); }
  async assignmentHasGroups(_: any, __: any) { return this.ok(false); }
  async verifyProfileCourse(_: any) { return this.ok({ course_id: "101", course_name: "Mock Course", name_changed: false }); }

  // Git Commands
  async verifyGitConnection(_: any) { return this.ok({ success: true, message: "Verified" } as any); }
  async verifyGitConnectionDraft(_: any) { return this.ok({ success: true, message: "Verified" } as any); }
  async listGitConnections() { return this.ok([]); }
  async getGitConnection(_: any) { return this.ok({} as any); }
  async saveGitConnection(_: any, __: any) { return this.ok(null); }
  async deleteGitConnection(_: any) { return this.ok(null); }
  async getIdentityMode(_: any) { return this.ok("Username" as any); }

  // Profile/Settings Commands
  async loadProfile(_: any) { return this.ok({ settings: {} as any, warnings: [] }); }
  async saveProfile(_: any, __: any) { return this.ok(null); }
  async saveProfileAndRoster(_: any, __: any, ___: any) { return this.ok(null); }
  async deleteProfile(_: any) { return this.ok(null); }
  async renameProfile(_: any, __: any) { return this.ok(null); }
  async createProfile(_: any, __: any) { return this.ok({} as any); }
  async loadSettings() { return this.ok({ settings: {} as any, warnings: [] }); }
  async resetSettings() { return this.ok({} as any); }
  async getDefaultSettings() { return {} as any; }
  async getSettingsPath() { return this.ok("/mock/settings.json"); }
  async settingsExist() { return this.ok(true); }
  async importSettings(_: any) { return this.ok({} as any); }
  async exportSettings(_: any, __: any) { return this.ok(null); }
  async getSettingsSchema() { return this.ok("{}"); }
  async loadSettingsOrDefault() { return this.ok({} as any); }

  // Roster Commands
  async getRoster(_: any) { return this.ok(null); }
  async clearRoster(_: any) { return this.ok(null); }
  async checkStudentRemoval(_: any, __: any, ___: any) { return this.ok({ affected_groups: [] }); }
  async importGitUsernames(_: any, __: any, ___: any) { return this.ok({ updated_count: 0, error_count: 0, errors: [] }); }
  async verifyGitUsernames(_: any, __: any, ___: any) { return this.ok({ verified_count: 0, failed_usernames: [] }); }
  async exportTeams(_: any, __: any, ___: any, ____: any) { return this.ok(null); }
  async exportStudents(_: any, __: any) { return this.ok(null); }
  async exportAssignmentStudents(_: any, __: any, ___: any) { return this.ok(null); }
  async getRosterCoverage(_: any) { return this.ok({ assignments: [] }); }
  async exportRosterCoverage(_: any, __: any, ___: any) { return this.ok(null); }
  async validateRoster(_: any) { return this.ok({ issues: [] }); }
  async validateAssignment(_: any, __: any, ___: any) { return this.ok({ issues: [] }); }

  // Repo Commands
  async preflightCreateRepos(_: any, __: any, ___: any, ____: any) { return this.ok({ existing_repos: [], missing_students: [] }); }
  async preflightCloneRepos(_: any, __: any, ___: any, ____: any) { return this.ok({ existing_repos: [], missing_students: [] }); }
  async preflightDeleteRepos(_: any, __: any, ___: any, ____: any) { return this.ok({ existing_repos: [], missing_students: [] }); }
  async createRepos(_: any, __: any, ___: any, ____: any) { return this.ok({ success_count: 0, failure_count: 0, errors: [] }); }
  async cloneReposFromRoster(_: any, __: any, ___: any, ____: any) { return this.ok({ success_count: 0, failure_count: 0, errors: [] }); }
  async deleteRepos(_: any, __: any, ___: any, ____: any) { return this.ok({ success_count: 0, failure_count: 0, errors: [] }); }

  // UI Commands
  async revealProfilesDirectory() { return this.ok(null); }
}
