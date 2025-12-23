import { defineConfig } from "vitepress"

export default defineConfig({
  ignoreDeadLinks: false,

  title: "repo-edu",
  description: "Tools for educational repository management",

  base: "/repo-edu/",

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "User Guide", link: "/user-guide/lms-import" },
      { text: "CLI", link: "/cli/overview" },
      { text: "Development", link: "/development/architecture" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Installation", link: "/getting-started/installation" },
          { text: "Quick Start", link: "/getting-started/quick-start" },
        ],
      },
      {
        text: "User Guide",
        items: [
          { text: "LMS Import", link: "/user-guide/lms-import" },
          { text: "Repository Setup", link: "/user-guide/repository-setup" },
          { text: "Settings & Profiles", link: "/user-guide/settings" },
        ],
      },
      {
        text: "CLI Reference",
        items: [
          { text: "Overview", link: "/cli/overview" },
          { text: "Installation", link: "/cli/installation" },
          { text: "LMS Commands", link: "/cli/lms-commands" },
          { text: "Repo Commands", link: "/cli/repo-commands" },
          { text: "Profile Commands", link: "/cli/profile-commands" },
          { text: "Configuration", link: "/cli/configuration" },
          { text: "Command Reference", link: "/cli/reference" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Settings Reference", link: "/reference/settings-reference" },
          { text: "Output Formats", link: "/reference/output-formats" },
          { text: "Environment Variables", link: "/reference/environment" },
          { text: "Troubleshooting", link: "/reference/troubleshooting" },
        ],
      },
      {
        text: "Development",
        items: [
          { text: "Architecture", link: "/development/architecture" },
          { text: "Crates", link: "/development/crates" },
          { text: "Contributing", link: "/development/contributing" },
          { text: "Building", link: "/development/building" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/repo-edu/repo-edu" },
    ],

    search: {
      provider: "local",
    },

    footer: {
      message: "Released under the MIT License.",
    },
  },
})
