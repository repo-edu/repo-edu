import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    react(),
    starlight({
      title: "repo-edu",
      description: "Educational Repository Management",
      social: {
        github: "https://github.com/repo-edu/repo-edu",
      },
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        { label: "Interactive Demo", slug: "demo" },
        {
            label: "Getting Started",
            items: [
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Quick Start", slug: "getting-started/quick-start" },
            ],
        },
        {
            label: "User Guide",
            items: [
            { label: "LMS Import", slug: "user-guide/lms-import" },
            { label: "Repository Setup", slug: "user-guide/repository-setup" },
            { label: "Settings & Profiles", slug: "user-guide/settings" },
            ],
        },
        {
            label: "CLI",
            items: [
            { label: "Overview", slug: "cli/overview" },
            { label: "Installation", slug: "cli/installation" },
            { label: "Profile Commands", slug: "cli/profile-commands" },
            { label: "LMS Commands", slug: "cli/lms-commands" },
            { label: "Roster Commands", slug: "cli/roster-commands" },
            { label: "Repository Commands", slug: "cli/repo-commands" },
            { label: "Git Commands", slug: "cli/git-commands" },
            { label: "Validate Commands", slug: "cli/validate-commands" },
            ],
        },
        {
            label: "Development",
            items: [
            { label: "Architecture", slug: "development/architecture" },
            { label: "Building", slug: "development/building" },
            { label: "Contributing", slug: "development/contributing" },
            { label: "Crates", slug: "development/crates" },
            { label: "Design Decisions", slug: "development/design-decisions" },
            ],
        },
        {
            label: "Reference",
            items: [
            { label: "Settings Reference", slug: "reference/settings-reference" },
            { label: "Output Formats", slug: "reference/output-formats" },
            { label: "Troubleshooting", slug: "reference/troubleshooting" },
            ],
        },
    ],
    }),
  ],
  server: {
    open: true,
  },
})
