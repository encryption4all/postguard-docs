# cryptify

[GitHub](https://github.com/encryption4all/cryptify) · Rust + TypeScript · File Sharing Service

Cryptify is the file encryption and sharing service that PostGuard uses for delivering encrypted files. It allows encrypting any file with an identity attribute. Only people who can prove they have that attribute can decrypt and view the contents.

The [PostGuard website](/repos/postguard-website) and the [JavaScript SDK](/repos/postguard-js) use Cryptify as the default file storage and delivery backend.

## Architecture

Cryptify has two parts:

- **Backend** (Rust, Rocket framework): Handles file storage, chunked uploads, email notifications, and serves the API.
- **Frontend** (TypeScript): Web UI for uploading and downloading encrypted files.

## Development

### Docker (recommended)

```bash
# Development setup
docker-compose -f docker-compose.dev.yml up

# Production-like setup
docker-compose up
```

### Manual Setup

#### Frontend

Requires Node.js 14+:

```bash
cd cryptify-front-end
npm install
npm run start    # development server
npm run build    # production build
```

When developing locally, change the `baseurl` constant in `FileProvider.ts` to `http://localhost:3000` so the frontend uses the local backend.

#### Backend

Requires Rust:

```bash
# Development (with auto-reload)
env ROCKET_ENV=development ROCKET_CONFIG=conf/Rocket.toml cargo watch -x run

# Production build
env ROCKET_ENV=production cargo build --release
```

The backend needs a `ROCKET_CONFIG` environment variable pointing to the configuration file. See the example in `conf/`.

### Electron Packaging

Cryptify can also be packaged as a desktop app:

```bash
cd cryptify-front-end
npm run dist-electron
```

## Releasing

This repository uses [Release-plz](https://release-plz.ieni.dev/) for automated versioning. Merging a release PR triggers a multi-architecture Docker image build.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Push to main | Release-plz PR/release, multi-arch Docker build |
