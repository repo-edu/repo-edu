import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'RepoManage',
  description: 'Tools for educational repository management',

  base: '/repo-edu/',

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'User Guide', link: '/user-guide/lms-import' },
      { text: 'Development', link: '/development/architecture' }
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Installation', link: '/getting-started/installation' },
          { text: 'Quick Start', link: '/getting-started/quick-start' }
        ]
      },
      {
        text: 'User Guide',
        items: [
          { text: 'LMS Import', link: '/user-guide/lms-import' },
          { text: 'Repository Setup', link: '/user-guide/repository-setup' },
          { text: 'Settings', link: '/user-guide/settings' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Settings Reference', link: '/reference/settings-reference' },
          { text: 'Troubleshooting', link: '/reference/troubleshooting' }
        ]
      },
      {
        text: 'Development',
        items: [
          { text: 'Architecture', link: '/development/architecture' },
          { text: 'Contributing', link: '/development/contributing' },
          { text: 'Building', link: '/development/building' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/repo-edu/repo-edu' }
    ],

    search: {
      provider: 'local'
    }
  }
})
