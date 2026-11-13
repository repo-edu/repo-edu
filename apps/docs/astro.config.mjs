import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"
import starlightSidebarTopics from "starlight-sidebar-topics"

export default defineConfig({
  site: "https://repo-edu.github.io",
  base: "/repo-edu",
  integrations: [
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
                    { label: "Source Areas", slug: "development/area-model" },
                    { label: "Architecture Check", slug: "development/architecture-check" },
                    { label: "Repository Records", slug: "development/repository-records" },
                    { label: "Analysis Execution", slug: "development/analysis-caching" },
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
                    { label: "Continuous Integration", slug: "development/continuous-integration" },
                    { label: "Linux Packaging", slug: "development/linux-packaging" },
                    { label: "Windows Distribution", slug: "development/windows-distribution" },
                    { label: "CLI Distribution", slug: "development/cli-distribution" },
                    { label: "GitHub Authentication", slug: "development/github-auth" },
                    { label: "Environment Variables", slug: "development/environment-variables" },
                    { label: "Contributing", slug: "development/contributing" },
                  ],
                },
              ],
            },
            {
              label: "Tooling Guide",
              link: "/tooling/",
              icon: "puzzle",
              id: "tooling-guide",
              items: [
                { label: "Overview", slug: "tooling" },
                {
                  label: "Audit phases",
                  items: [
                    { label: "/audit", slug: "tooling/audit" },
                    { label: "/vet", slug: "tooling/vet" },
                    { label: "/rebut", slug: "tooling/rebut" },
                    { label: "/fix", slug: "tooling/fix" },
                  ],
                },
                {
                  label: "Other chat commands",
                  items: [
                    { label: "/simple", link: "/tooling/chat-helpers/#simple" },
                    { label: "/rewrite", link: "/tooling/chat-helpers/#rewrite" },
                    { label: "/brief-plan", slug: "tooling/brief-plan" },
                    { label: "/watch", slug: "tooling/watch" },
                    { label: "/close", slug: "tooling/close" },
                    { label: "/ruling", slug: "tooling/answer-ruling" },
                    { label: "/yield", link: "/tooling/yield/#yield" },
                    { label: "/yield-vet", link: "/tooling/yield/#yield-vet" },
                    { label: "/yield-rebut", link: "/tooling/yield/#yield-rebut" },
                    { label: "/yield-final", link: "/tooling/yield/#yield-final" },
                    { label: "/sweep", slug: "tooling/sweep" },
                    { label: "/refactor", slug: "tooling/refactor" },
                  ],
                },
                {
                  label: "Runner commands",
                  items: [
                    {
                      label: "pnpm audit-round <stem>",
                      slug: "tooling/full-plan-run",
                    },
                    { label: "pnpm audit-round round", slug: "tooling/runner-round" },
                    { label: "pnpm audit-round models", slug: "tooling/models" },
                    { label: "pnpm audit-round disprove", slug: "tooling/disprove" },
                    { label: "pnpm audit-round settle", slug: "tooling/settle" },
                    { label: "pnpm audit-round ready", slug: "tooling/ready" },
                    { label: "pnpm audit-round implement", slug: "tooling/implement" },
                    { label: "pnpm audit-round close", slug: "tooling/runner-close" },
                    { label: "pnpm audit-round plan", slug: "tooling/plan" },
                    {
                      label: "pnpm audit-round:contract",
                      slug: "tooling/audit-round-contract",
                    },
                    { label: "pnpm sweep", link: "/tooling/sweep/#next" },
                    { label: "pnpm sweep ok", link: "/tooling/sweep/#ok" },
                    { label: "pnpm sweep flag", link: "/tooling/sweep/#flag" },
                    { label: "pnpm sweep queue", link: "/tooling/sweep/#queue" },
                    { label: "pnpm sweep done", link: "/tooling/sweep/#done" },
                  ],
                },
                {
                  label: "Guides",
                  items: [
                    { label: "Plan lifecycle", slug: "tooling/plan-lifecycle" },
                    { label: "Run an audit round", slug: "tooling/run-audit-round" },
                    { label: "Recover a run", slug: "tooling/recover-run" },
                    { label: "Find round outputs", slug: "tooling/find-round-outputs" },
                  ],
                },
              ],
            },
          ],
          {
            exclude: ["/404"],
            topics: {
              "user-guide": ["index"],
              "tooling-guide": ["/tooling/yield", "/tooling/chat-helpers"],
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
