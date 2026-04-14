# postguard-docs

> For full documentation, visit [docs.postguard.eu](https://docs.postguard.eu/repos/postguard-docs).

The central documentation site for the PostGuard project. Built with [VitePress](https://vitepress.dev/) and hosted at [docs.postguard.eu](https://docs.postguard.eu).

This site contains guides, SDK reference documentation, integration instructions, and per-repository documentation for all repos in the [encryption4all](https://github.com/encryption4all) organization.

## Development

### Prerequisites

- Node.js 18+

### Running Locally

```bash
npm install
npm run docs:dev
```

The dev server starts with hot reload at `http://localhost:5173`.

### Building

```bash
npm run docs:build
npm run docs:preview   # preview the built site
```

## Releasing

The site is deployed automatically via GitHub Actions. Pushing to `main` triggers a Docker image build (NGINX-based static hosting) which is deployed to production.

## License

MIT
