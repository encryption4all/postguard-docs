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
      { text: 'Repositories', link: '/repos/overview' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'What is PostGuard?', link: '/guide/what-is-postguard' },
          { text: 'Usage Flows', link: '/guide/usage-flows' },
          { text: 'Core Concepts', link: '/guide/concepts' },
          { text: 'Architecture', link: '/guide/architecture' },
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Protocol Specification', link: '/guide/protocol' },
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
      {
        text: 'Repositories',
        items: [
          { text: 'Overview', link: '/repos/overview' },
          {
            text: 'Cryptographic Libraries',
            collapsed: false,
            items: [
              { text: 'pg-curve', link: '/repos/pg-curve' },
              { text: 'ibe', link: '/repos/ibe' },
              { text: 'ibs', link: '/repos/ibs' },
            ],
          },
          {
            text: 'Core',
            collapsed: false,
            items: [
              { text: 'postguard', link: '/repos/postguard' },
            ],
          },
          {
            text: 'SDKs',
            collapsed: false,
            items: [
              { text: 'postguard-js', link: '/repos/postguard-js' },
              { text: 'postguard-dotnet', link: '/repos/postguard-dotnet' },
              { text: 'irmaseal-mail-utils', link: '/repos/irmaseal-mail-utils' },
              { text: 'pg-components', link: '/repos/pg-components' },
            ],
          },
          {
            text: 'Applications',
            collapsed: false,
            items: [
              { text: 'postguard-website', link: '/repos/postguard-website' },
              { text: 'postguard-tb-addon', link: '/repos/postguard-tb-addon' },
              { text: 'postguard-outlook-addon', link: '/repos/postguard-outlook-addon' },
              { text: 'cryptify', link: '/repos/cryptify' },
              { text: 'postguard-fallback', link: '/repos/postguard-fallback' },
            ],
          },
          {
            text: 'Examples & Docs',
            collapsed: false,
            items: [
              { text: 'postguard-examples', link: '/repos/postguard-examples' },
              { text: 'pg-example', link: '/repos/pg-example' },
              { text: 'pdf-signature', link: '/repos/pdf-signature' },
              { text: 'postguard-docs', link: '/repos/postguard-docs' },
            ],
          },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/encryption4all' },
    ],
  },
})
