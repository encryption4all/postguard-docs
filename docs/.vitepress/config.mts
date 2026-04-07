import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'PostGuard',
  description: 'End-to-end encryption using identity-based encryption and Yivi',
  head: [['link', { rel: 'icon', href: '/pg_logo_no_text.svg' }]],
  themeConfig: {
    logo: '/pg_logo_no_text.svg',
    nav: [
      { text: 'Guide', link: '/guide/what-is-postguard' },
      { text: 'SDK', link: '/sdk/overview' },
      { text: 'Integrations', link: '/integrations/web-app' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'What is PostGuard?', link: '/guide/what-is-postguard' },
          { text: 'Core Concepts', link: '/guide/concepts' },
          { text: 'Architecture', link: '/guide/architecture' },
          { text: 'Getting Started', link: '/guide/getting-started' },
        ],
      },
      {
        text: 'SDK Reference',
        items: [
          { text: 'Overview', link: '/sdk/overview' },
          { text: 'Encryption', link: '/sdk/encryption' },
          { text: 'Decryption', link: '/sdk/decryption' },
          { text: 'Email Helpers', link: '/sdk/email-helpers' },
          { text: 'Authentication Methods', link: '/sdk/auth-methods' },
          { text: 'Error Handling', link: '/sdk/errors' },
        ],
      },
      {
        text: 'Integrations',
        items: [
          { text: 'Web Application', link: '/integrations/web-app' },
          { text: 'Email Addon', link: '/integrations/email-addon' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/encryption4all' },
    ],
  },
})
