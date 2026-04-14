# pdf-signature

[GitHub](https://github.com/encryption4all/pdf-signature) · Rust + TypeScript · PDF Signing

PDF signing and signature verification utility. Used within the PostGuard ecosystem for signing PDF documents with identity-based signatures. This is a fork of [Cryptify](/repos/cryptify) with the same architecture.

## Architecture

The repository is structured similarly to [Cryptify](/repos/cryptify), with a Rust backend and TypeScript frontend:

- **Backend** (`cryptify-back-end/`): Rust (Rocket) service handling PDF operations, file storage, and email notifications
- **Frontend** (`cryptify-front-end/`): TypeScript web interface

## Development

### Docker (recommended)

```bash
# Development setup
docker-compose -f docker-compose.dev.yml up

# Production-like setup
docker-compose up
```

### Frontend (manual)

Requires Node.js and Rust.

```bash
cd cryptify-front-end
npm install
npm run start    # development server
npm run build    # production build
```

When developing locally, change the `baseurl` constant in `FileProvider.ts` to `http://localhost:3000` so the frontend uses the local backend.

Cryptify/pdf-signature can also be packaged as a desktop app:

```bash
cd cryptify-front-end
npm run dist-electron
```

### Backend (manual)

The backend needs a configuration file. See `conf/` for examples.

#### Configuration

The configuration file (`conf/config.toml` or `conf/config.dev.toml`) controls:

| Option | Description |
|---|---|
| `server_url` | Public URL of the service |
| `address` | Bind address (e.g. `0.0.0.0`) |
| `data_dir` | Directory for file storage |
| `email_from` | Sender address for email notifications |
| `smtp_url` | SMTP server hostname |
| `smtp_port` | SMTP server port |
| `smtp_credentials` | SMTP username and password (optional) |
| `allowed_origins` | CORS allowed origins (regex) |
| `pkg_url` | PostGuard PKG server URL |

#### Building and running

```bash
# Build
env ROCKET_ENV=development cargo build
env ROCKET_ENV=production cargo build --release

# Run (pass the config file path)
env ROCKET_CONFIG=conf/config.dev.toml ./target/debug/cryptify-backend

# Development with auto-reload
env ROCKET_ENV=development ROCKET_CONFIG=conf/config.dev.toml cargo watch -x run
```

## Releasing

This repository does not have automated releases.
