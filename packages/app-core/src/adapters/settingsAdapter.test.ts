import { describe, expect, it } from "vitest"
import type { AppSettings, ProfileSettings } from "@repo-edu/backend-interface/types"
import {
  appSettingsToStore,
  defaultAppSettingsState,
  defaultProfileSettingsState,
  profileSettingsToStore,
  storeToAppSettings,
  storeToProfileSettings,
} from "./settingsAdapter"

const sampleAppSettings: AppSettings = {
  theme: "dark",
  date_format: "DMY",
  time_format: "24h",
  lms_connection: {
    lms_type: "canvas",
    base_url: "https://canvas.example.com",
    access_token: "lms-token",
  },
  git_connections: {
    "my-github": {
      server_type: "GitHub",
      connection: {
        access_token: "gh-token",
        base_url: null,
        user: "ghuser",
      },
      identity_mode: "username",
    },
  },
}

const sampleProfileSettings: ProfileSettings = {
  course: { id: "42", name: "Algorithms" },
  git_connection: "my-github",
  operations: {
    target_org: "student-repos",
    repo_name_template: "{assignment}-{group}",
    create: { template_org: "templates" },
    clone: { target_dir: "/tmp/repos", directory_layout: "flat" },
    delete: {},
  },
  exports: {
    output_folder: "/tmp/output",
    output_csv: true,
    output_xlsx: false,
    output_yaml: true,
    csv_file: "students.csv",
    xlsx_file: "students.xlsx",
    yaml_file: "students.yaml",
    member_option: "(email, gitid)",
    include_group: true,
    include_member: true,
    include_initials: false,
    full_groups: true,
  },
}

describe("settingsAdapter", () => {
  describe("AppSettings", () => {
    it("round-trips backend -> store -> backend without losing data", () => {
      const store = appSettingsToStore(sampleAppSettings)
      const roundTrip = storeToAppSettings(store)
      expect(roundTrip).toEqual(sampleAppSettings)
    })

    it("handles null lms_connection", () => {
      const settings: AppSettings = {
        ...sampleAppSettings,
        lms_connection: null,
      }
      const store = appSettingsToStore(settings)
      expect(store.lmsConnection).toBeNull()
      const roundTrip = storeToAppSettings(store)
      expect(roundTrip.lms_connection).toBeNull()
    })

    it("handles empty git_connections", () => {
      const settings: AppSettings = {
        ...sampleAppSettings,
        git_connections: {},
      }
      const store = appSettingsToStore(settings)
      expect(store.gitConnections).toEqual({})
    })

    it("provides sensible defaults", () => {
      expect(defaultAppSettingsState.theme).toBe("system")
      expect(defaultAppSettingsState.lmsConnection).toBeNull()
      expect(defaultAppSettingsState.gitConnections).toEqual({})
    })
  })

  describe("ProfileSettings", () => {
    it("round-trips backend -> store -> backend without losing data", () => {
      const store = profileSettingsToStore(sampleProfileSettings)
      const roundTrip = storeToProfileSettings(store)
      expect(roundTrip).toEqual(sampleProfileSettings)
    })

    it("handles null git_connection", () => {
      const settings: ProfileSettings = {
        ...sampleProfileSettings,
        git_connection: null,
      }
      const store = profileSettingsToStore(settings)
      expect(store.gitConnection).toBeNull()
      const roundTrip = storeToProfileSettings(store)
      expect(roundTrip.git_connection).toBeNull()
    })

    it("preserves operations config", () => {
      const store = profileSettingsToStore(sampleProfileSettings)
      expect(store.operations.target_org).toBe("student-repos")
      expect(store.operations.repo_name_template).toBe("{assignment}-{group}")
      expect(store.operations.create.template_org).toBe("templates")
      expect(store.operations.clone.directory_layout).toBe("flat")
    })

    it("preserves exports config", () => {
      const store = profileSettingsToStore(sampleProfileSettings)
      expect(store.exports.output_csv).toBe(true)
      expect(store.exports.output_yaml).toBe(true)
      expect(store.exports.member_option).toBe("(email, gitid)")
    })

    it("provides sensible defaults", () => {
      expect(defaultProfileSettingsState.course).toEqual({ id: "", name: "" })
      expect(defaultProfileSettingsState.gitConnection).toBeNull()
      expect(defaultProfileSettingsState.exports.output_yaml).toBe(true)
    })
  })
})
