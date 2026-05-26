# postguard-docs

> For full documentation, visit [docs.postguard.eu](https://docs.postguard.eu).

The central documentation site for the PostGuard project. Built with [VitePress](https://vitepress.dev/) and hosted at [docs.postguard.eu](https://docs.postguard.eu).

This site contains guides, SDK reference documentation, integration instructions, and per-repository documentation for all repos in the [encryption4all](https://github.com/encryption4all) organization.

## Development

### Prerequisites

- Node.js 22+

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

Pushing to `main` triggers `.github/workflows/ci.yml`, which builds and pushes the Docker image to `ghcr.io/encryption4all/postguard-docs:edge`. There is no automatic deploy step. The host running production at `docs.postguard.eu` (an NGINX container serving the built `docs/.vitepress/dist`) has to pull the new `edge` tag and restart the container to pick up changes.

## License

MIT
