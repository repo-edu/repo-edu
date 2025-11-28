import { describe, it, expect, beforeEach } from "vitest";
import { useRepoFormStore } from "./repoFormStore";

describe("repoFormStore", () => {
  beforeEach(() => {
    useRepoFormStore.getState().reset();
  });

  it("has correct initial state", () => {
    const state = useRepoFormStore.getState().getState();
    expect(state.baseUrl).toBe("https://gitlab.tue.nl");
    expect(state.directoryLayout).toBe("flat");
    expect(state.logLevels.info).toBe(true);
    expect(state.logLevels.debug).toBe(false);
    expect(state.logLevels.warning).toBe(true);
    expect(state.logLevels.error).toBe(true);
  });

  describe("setField", () => {
    it("updates a single field", () => {
      useRepoFormStore.getState().setField("user", "testuser");
      expect(useRepoFormStore.getState().user).toBe("testuser");
    });

    it("updates nested logLevels object", () => {
      useRepoFormStore.getState().setField("logLevels", {
        info: false,
        debug: true,
        warning: false,
        error: true,
      });
      const state = useRepoFormStore.getState().getState();
      expect(state.logLevels.info).toBe(false);
      expect(state.logLevels.debug).toBe(true);
    });

    it("updates directoryLayout", () => {
      useRepoFormStore.getState().setField("directoryLayout", "by-team");
      expect(useRepoFormStore.getState().directoryLayout).toBe("by-team");
    });
  });

  describe("setLogLevel", () => {
    it("updates individual log level", () => {
      useRepoFormStore.getState().setLogLevel("debug", true);
      expect(useRepoFormStore.getState().logLevels.debug).toBe(true);
    });

    it("preserves other log levels", () => {
      useRepoFormStore.getState().setLogLevel("debug", true);
      const state = useRepoFormStore.getState().getState();
      expect(state.logLevels.info).toBe(true);
      expect(state.logLevels.warning).toBe(true);
      expect(state.logLevels.error).toBe(true);
    });
  });

  describe("reset", () => {
    it("resets all fields to initial state", () => {
      useRepoFormStore.getState().setField("user", "testuser");
      useRepoFormStore.getState().setField("accessToken", "secret");
      useRepoFormStore.getState().setLogLevel("debug", true);

      useRepoFormStore.getState().reset();

      const state = useRepoFormStore.getState().getState();
      expect(state.user).toBe("");
      expect(state.accessToken).toBe("");
      expect(state.logLevels.debug).toBe(false);
    });
  });

  describe("loadFromSettings", () => {
    it("loads partial settings", () => {
      useRepoFormStore.getState().loadFromSettings({
        user: "admin",
        accessToken: "token123",
      });

      const state = useRepoFormStore.getState().getState();
      expect(state.user).toBe("admin");
      expect(state.accessToken).toBe("token123");
      // Other fields should have default values
      expect(state.baseUrl).toBe("https://gitlab.tue.nl");
    });

    it("loads nested logLevels", () => {
      useRepoFormStore.getState().loadFromSettings({
        logLevels: {
          info: false,
          debug: true,
          warning: false,
          error: true,
        },
      });

      const state = useRepoFormStore.getState().getState();
      expect(state.logLevels.info).toBe(false);
      expect(state.logLevels.debug).toBe(true);
    });

    it("resets to defaults before applying settings", () => {
      useRepoFormStore.getState().setField("user", "olduser");

      useRepoFormStore.getState().loadFromSettings({
        accessToken: "newtoken",
      });

      // user should be reset to default ("")
      expect(useRepoFormStore.getState().user).toBe("");
      expect(useRepoFormStore.getState().accessToken).toBe("newtoken");
    });
  });

  describe("getState", () => {
    it("returns a plain object with all form fields", () => {
      const state = useRepoFormStore.getState().getState();

      // Should have all RepoFormState fields
      expect(state).toHaveProperty("accessToken");
      expect(state).toHaveProperty("user");
      expect(state).toHaveProperty("baseUrl");
      expect(state).toHaveProperty("studentReposGroup");
      expect(state).toHaveProperty("templateGroup");
      expect(state).toHaveProperty("yamlFile");
      expect(state).toHaveProperty("targetFolder");
      expect(state).toHaveProperty("assignments");
      expect(state).toHaveProperty("directoryLayout");
      expect(state).toHaveProperty("logLevels");

      // Should NOT have store methods
      expect(state).not.toHaveProperty("setField");
      expect(state).not.toHaveProperty("setLogLevel");
      expect(state).not.toHaveProperty("reset");
    });

    it("returns a copy of logLevels", () => {
      const state = useRepoFormStore.getState().getState();
      state.logLevels.debug = true;

      // Original store should be unchanged
      expect(useRepoFormStore.getState().logLevels.debug).toBe(false);
    });
  });
});
