# postguard-docs

[GitHub](https://github.com/encryption4all/postguard-docs) · VitePress · Documentation Site

This documentation site. Built with [VitePress](https://vitepress.dev/) and hosted at [docs.postguard.eu](https://docs.postguard.eu).

## Development

### Prerequisites

- Node.js 18+

### Running Locally

```bash
npm install
npm run docs:dev      # start dev server with hot reload
```

### Building

```bash
npm run docs:build    # build static site
npm run docs:preview  # preview the built site
```

## Deployment

The site is built as a Docker image using the included `Dockerfile` (NGINX-based static hosting) and deployed via GitHub Actions.

## Writing Guidelines

See `CLAUDE.md` in the repository root for the full writing style guide, including banned words, structural rules, and code snippet conventions.

### Code Snippets

Code examples must come from real, working code in the source repositories. Snippets are pasted inline as fenced code blocks with a source link underneath pointing to the exact file and lines on GitHub, pinned to a commit hash.
