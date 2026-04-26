import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"
import starlightSidebarTopics from "starlight-sidebar-topics"

export default defineConfig({
  site: "https://repo-edu.github.io",
  base: "/repo-edu",
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      noExternal: [/^@repo-edu\//],
    },
    resolve: {
      conditions: ["source"],
    },
  },
  integrations: [
    react(),
    starlight({
      title: "repo-edu",
      description: "Educational Repository Management",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/repo-edu/repo-edu" },
      ],
      customCss: ["./src/styles/custom.css"],
      plugins: [
        starlightSidebarTopics(
          [
            {
              label: "User Guide",
              link: "/getting-started/installation/",
              icon: "open-book",
              id: "user-guide",
              items: [
                {
                  label: "Getting Started",
                  items: [
                    { label: "Interactive Demo", slug: "demo" },
                    { label: "Installation", slug: "getting-started/installation" },
                    { label: "Quick Start", slug: "getting-started/quick-start" },
                  ],
                },
                {
                  label: "Desktop App",
                  items: [
                    { label: "Overview", slug: "desktop/overview" },
                    { label: "Roster Management", slug: "desktop/roster-management" },
                    { label: "Groups & Assignments", slug: "desktop/groups-assignments" },
                  ],
                },
                {
                  label: "Workflows",
                  items: [
                    { label: "LMS Import", slug: "user-guide/lms-import" },
                    { label: "Repository Setup", slug: "user-guide/repository-setup" },
                    { label: "Coming from RepoBee", slug: "user-guide/from-repobee" },
                    { label: "Settings & Courses", slug: "user-guide/settings" },
                  ],
                },
                {
                  label: "CLI",
                  items: [
                    { label: "Overview", slug: "cli/overview" },
                    { label: "Installation", slug: "cli/installation" },
                    { label: "Course Commands", slug: "cli/course-commands" },
                    { label: "LMS Commands", slug: "cli/lms-commands" },
                    { label: "Repository Commands", slug: "cli/repo-commands" },
                    { label: "Git Commands", slug: "cli/git-commands" },
                    { label: "Validate Commands", slug: "cli/validate-commands" },
                  ],
                },
                {
                  label: "Reference",
                  items: [
                    { label: "Settings Reference", slug: "reference/settings-reference" },
                    { label: "Output Formats", slug: "reference/output-formats" },
                    { label: "Updating", slug: "reference/updating" },
                    { label: "Troubleshooting", slug: "reference/troubleshooting" },
                  ],
                },
              ],
            },
            {
              label: "Developer Guide",
              link: "/development/architecture/",
              icon: "seti:config",
              id: "dev-guide",
              items: [
                {
                  label: "Architecture",
                  items: [
                    { label: "Overview", slug: "development/architecture" },
                    { label: "Renderer App", slug: "development/renderer-app" },
                    { label: "CLI-GUI Parity", slug: "development/cli-gui-parity" },
                    { label: "Data Model", slug: "development/data-model" },
                    { label: "Repository Records", slug: "development/repository-records" },
                    { label: "Analysis Caching", slug: "development/analysis-caching" },
                  ],
                },
                {
                  label: "Workflow System",
                  items: [
                    { label: "Overview", slug: "development/workflow-overview" },
                    { label: "Payload Channels", slug: "development/workflow-channels" },
                    { label: "Catalog & Profiles", slug: "development/workflow-catalog" },
                    { label: "Transport Adapters", slug: "development/workflow-transport" },
                    { label: "Error Taxonomy", slug: "development/workflow-errors" },
                    { label: "Adding a Workflow", slug: "development/workflow-adding" },
                  ],
                },
                {
                  label: "Contributing",
                  items: [
                    { label: "Building", slug: "development/building" },
                    { label: "Contributing", slug: "development/contributing" },
                  ],
                },
              ],
            },
          ],
          {
            exclude: ["/404"],
            topics: {
              "user-guide": ["index"],
            },
          },
        ),
      ],
    }),
  ],
  server: {
    open: true,
  },
})
