import { beforeEach, describe, expect, it } from "vitest"
import { useRepoFormStore } from "./repoFormStore"

describe("repoFormStore", () => {
  beforeEach(() => {
    useRepoFormStore.getState().reset()
  })

  it("has correct initial state", () => {
    const state = useRepoFormStore.getState().getState()
    expect(state.gitServerType).toBe("GitLab")
    expect(state.gitlab.baseUrl).toBe("https://gitlab.tue.nl")
    expect(state.directoryLayout).toBe("flat")
    expect(state.logLevels.info).toBe(true)
    expect(state.logLevels.debug).toBe(false)
    expect(state.logLevels.warning).toBe(true)
    expect(state.logLevels.error).toBe(true)
  })

  describe("setGitServerType", () => {
    it("changes the active server type", () => {
      useRepoFormStore.getState().setGitServerType("GitHub")
      expect(useRepoFormStore.getState().gitServerType).toBe("GitHub")
    })

    it("preserves other server configs when switching", () => {
      // Set GitLab token
      useRepoFormStore.getState().setGitLabField("accessToken", "gitlab-token")

      // Switch to GitHub
      useRepoFormStore.getState().setGitServerType("GitHub")
      useRepoFormStore.getState().setGitHubField("accessToken", "github-token")

      // Switch back to GitLab
      useRepoFormStore.getState().setGitServerType("GitLab")

      // GitLab token should be preserved
      expect(useRepoFormStore.getState().gitlab.accessToken).toBe(
        "gitlab-token",
      )
      expect(useRepoFormStore.getState().github.accessToken).toBe(
        "github-token",
      )
    })
  })

  describe("setGitLabField", () => {
    it("updates a single GitLab field", () => {
      useRepoFormStore.getState().setGitLabField("user", "testuser")
      expect(useRepoFormStore.getState().gitlab.user).toBe("testuser")
    })

    it("updates only GitLab config", () => {
      useRepoFormStore.getState().setGitLabField("accessToken", "gl-token")
      expect(useRepoFormStore.getState().gitlab.accessToken).toBe("gl-token")
      expect(useRepoFormStore.getState().github.accessToken).toBe("")
    })
  })

  describe("setGitHubField", () => {
    it("updates a single GitHub field", () => {
      useRepoFormStore.getState().setGitHubField("user", "ghuser")
      expect(useRepoFormStore.getState().github.user).toBe("ghuser")
    })
  })

  describe("setGiteaField", () => {
    it("updates a single Gitea field", () => {
      useRepoFormStore
        .getState()
        .setGiteaField("baseUrl", "https://gitea.example.com")
      expect(useRepoFormStore.getState().gitea.baseUrl).toBe(
        "https://gitea.example.com",
      )
    })
  })

  describe("setField", () => {
    it("updates nested logLevels object", () => {
      useRepoFormStore.getState().setField("logLevels", {
        info: false,
        debug: true,
        warning: false,
        error: true,
      })
      const state = useRepoFormStore.getState().getState()
      expect(state.logLevels.info).toBe(false)
      expect(state.logLevels.debug).toBe(true)
    })

    it("updates directoryLayout", () => {
      useRepoFormStore.getState().setField("directoryLayout", "by-team")
      expect(useRepoFormStore.getState().directoryLayout).toBe("by-team")
    })
  })

  describe("setLogLevel", () => {
    it("updates individual log level", () => {
      useRepoFormStore.getState().setLogLevel("debug", true)
      expect(useRepoFormStore.getState().logLevels.debug).toBe(true)
    })

    it("preserves other log levels", () => {
      useRepoFormStore.getState().setLogLevel("debug", true)
      const state = useRepoFormStore.getState().getState()
      expect(state.logLevels.info).toBe(true)
      expect(state.logLevels.warning).toBe(true)
      expect(state.logLevels.error).toBe(true)
    })
  })

  describe("reset", () => {
    it("resets all fields to initial state", () => {
      useRepoFormStore.getState().setGitLabField("user", "testuser")
      useRepoFormStore.getState().setGitLabField("accessToken", "secret")
      useRepoFormStore.getState().setLogLevel("debug", true)

      useRepoFormStore.getState().reset()

      const state = useRepoFormStore.getState().getState()
      expect(state.gitlab.user).toBe("")
      expect(state.gitlab.accessToken).toBe("")
      expect(state.logLevels.debug).toBe(false)
    })
  })

  describe("loadFromSettings", () => {
    it("loads partial settings", () => {
      useRepoFormStore.getState().loadFromSettings({
        gitlab: {
          accessToken: "token123",
          baseUrl: "https://gitlab.example.com",
          user: "admin",
        },
      })

      const state = useRepoFormStore.getState().getState()
      expect(state.gitlab.user).toBe("admin")
      expect(state.gitlab.accessToken).toBe("token123")
      expect(state.gitlab.baseUrl).toBe("https://gitlab.example.com")
    })

    it("loads nested logLevels", () => {
      useRepoFormStore.getState().loadFromSettings({
        logLevels: {
          info: false,
          debug: true,
          warning: false,
          error: true,
        },
      })

      const state = useRepoFormStore.getState().getState()
      expect(state.logLevels.info).toBe(false)
      expect(state.logLevels.debug).toBe(true)
    })

    it("resets to defaults before applying settings", () => {
      useRepoFormStore.getState().setGitLabField("user", "olduser")

      useRepoFormStore.getState().loadFromSettings({
        gitlab: {
          accessToken: "newtoken",
          baseUrl: "https://gitlab.tue.nl",
          user: "",
        },
      })

      // user should be reset to default ("")
      expect(useRepoFormStore.getState().gitlab.user).toBe("")
      expect(useRepoFormStore.getState().gitlab.accessToken).toBe("newtoken")
    })
  })

  describe("getState", () => {
    it("returns a plain object with all form fields", () => {
      const state = useRepoFormStore.getState().getState()

      // Should have all RepoFormState fields
      expect(state).toHaveProperty("gitServerType")
      expect(state).toHaveProperty("github")
      expect(state).toHaveProperty("gitlab")
      expect(state).toHaveProperty("gitea")
      expect(state).toHaveProperty("yamlFile")
      expect(state).toHaveProperty("targetFolder")
      expect(state).toHaveProperty("assignments")
      expect(state).toHaveProperty("directoryLayout")
      expect(state).toHaveProperty("logLevels")

      // Per-server org/group fields are in nested configs
      expect(state.github).toHaveProperty("studentReposOrg")
      expect(state.github).toHaveProperty("templateOrg")
      expect(state.gitlab).toHaveProperty("studentReposGroup")
      expect(state.gitlab).toHaveProperty("templateGroup")
      expect(state.gitea).toHaveProperty("studentReposGroup")
      expect(state.gitea).toHaveProperty("templateGroup")

      // Should NOT have store methods
      expect(state).not.toHaveProperty("setField")
      expect(state).not.toHaveProperty("setLogLevel")
      expect(state).not.toHaveProperty("reset")
    })

    it("returns a copy of logLevels", () => {
      const state = useRepoFormStore.getState().getState()
      state.logLevels.debug = true

      // Original store should be unchanged
      expect(useRepoFormStore.getState().logLevels.debug).toBe(false)
    })
  })

  describe("getActiveConfig", () => {
    it("returns GitHub config when GitHub selected", () => {
      useRepoFormStore.getState().setGitServerType("GitHub")
      useRepoFormStore.getState().setGitHubField("user", "ghuser")

      const config = useRepoFormStore.getState().getActiveConfig()
      expect(config.user).toBe("ghuser")
      expect("baseUrl" in config).toBe(false)
    })

    it("returns GitLab config when GitLab selected", () => {
      useRepoFormStore.getState().setGitServerType("GitLab")
      useRepoFormStore
        .getState()
        .setGitLabField("baseUrl", "https://gitlab.example.com")

      const config = useRepoFormStore.getState().getActiveConfig()
      expect((config as { baseUrl: string }).baseUrl).toBe(
        "https://gitlab.example.com",
      )
    })

    it("returns Gitea config when Gitea selected", () => {
      useRepoFormStore.getState().setGitServerType("Gitea")
      useRepoFormStore
        .getState()
        .setGiteaField("baseUrl", "https://gitea.example.com")

      const config = useRepoFormStore.getState().getActiveConfig()
      expect((config as { baseUrl: string }).baseUrl).toBe(
        "https://gitea.example.com",
      )
    })
  })
})
