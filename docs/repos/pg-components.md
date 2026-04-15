# pg-components

[GitHub](https://github.com/encryption4all/pg-components) · Svelte · UI Component Library

Reusable UI component library for PostGuard applications. Published as `@e4a/pg-components` on npm.

Used by the [PostGuard website](/repos/postguard-website) for shared UI elements like file pickers, progress indicators, and Yivi authentication dialogs.

## Development

### Prerequisites

- Node.js
- Yarn

### Developing

```bash
yarn dev
```

This starts a development server with a test page (see `src/routes/index.svelte`) where you can preview components.

### Building

```bash
yarn build    # package the library
```

### Other Commands

```bash
yarn test     # run tests
yarn lint     # linting
yarn format   # code formatting
```

## Releasing

Versions are published manually to npm. The package is an ESM module with Svelte as a peer dependency.
