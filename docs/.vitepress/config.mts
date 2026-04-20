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
      { text: 'Repositories', link: '/repos/overview' },
      { text: 'PostGuard', link: 'https://postguard.eu' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'What is PostGuard?', link: '/guide/what-is-postguard' },
          { text: 'Usage Flows', link: '/guide/usage-flows' },
          { text: 'Core Concepts', link: '/guide/concepts' },
          { text: 'Architecture', link: '/guide/architecture' },
          { text: 'Protocol Specification', link: '/guide/protocol' },
        ],
      },
      {
        text: 'SDK Reference',
        items: [
          { text: 'Overview', link: '/sdk/overview' },
          { text: 'Getting Started', link: '/sdk/getting-started' },
          {
            text: 'JavaScript SDK',
            collapsed: false,
            items: [
              { text: 'Encryption', link: '/sdk/js-encryption' },
              { text: 'Decryption', link: '/sdk/js-decryption' },
              { text: 'Email Helpers', link: '/sdk/js-email-helpers' },
              { text: 'Authentication Methods', link: '/sdk/js-auth-methods' },
              { text: 'Error Handling', link: '/sdk/js-errors' },
            ],
          },
          {
            text: '.NET SDK',
            collapsed: false,
            items: [
              { text: 'Encryption', link: '/sdk/dotnet-encryption' },
              { text: 'Error Handling', link: '/sdk/dotnet-errors' },
            ],
          },
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
              { text: 'postguard-website', link: '/repos/postguard-website' },
              { text: 'postguard-business', link: '/repos/postguard-business' },
              { text: 'cryptify', link: '/repos/cryptify' },
              { text: 'postguard-tb-addon', link: '/repos/postguard-tb-addon' },
              { text: 'postguard-outlook-addon', link: '/repos/postguard-outlook-addon' },
            ],
          },
          {
            text: 'SDKs',
            collapsed: false,
            items: [
              { text: 'postguard-js', link: '/repos/postguard-js' },
              { text: 'postguard-dotnet', link: '/repos/postguard-dotnet' },
              { text: 'pg-components', link: '/repos/pg-components' },
            ],
          },
          {
            text: 'postguard-examples',
            collapsed: false,
            items: [
              { text: 'pg-sveltekit', link: '/repos/pg-sveltekit' },
              { text: 'pg-dotnet', link: '/repos/pg-dotnet' },
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
