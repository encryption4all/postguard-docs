# pdf-signature

[GitHub](https://github.com/encryption4all/pdf-signature) · Rust + TypeScript · PDF Signing

PDF signing and signature verification utility forked from [Cryptify](/repos/cryptify). It encrypts and decrypts files based on IRMA/Yivi attributes, allowing only people with the right attributes to view the contents.

## Architecture

The repository is structured similarly to [Cryptify](/repos/cryptify), with a Rust backend and TypeScript frontend:

- **Backend** (`cryptify-back-end/`): Rust (Rocket) service handling file storage, chunked uploads, email notifications, and the HTTP API.
- **Frontend** (`cryptify-front-end/`): TypeScript/React web interface with optional Electron packaging.

## Configuration

The backend reads its configuration from a TOML file. Example configuration files are in `conf/`. Set the `ROCKET_CONFIG` environment variable to point to the configuration file.

Configuration parameters:

| Parameter | Description | Example |
|---|---|---|
| `server_url` | Public URL of the frontend | `http://localhost:8080/` |
| `address` | Bind address | `0.0.0.0` |
| `data_dir` | Directory for storing uploaded files | `/tmp/data` |
| `email_from` | Sender address for notification emails | `noreply@postguard.local` |
| `smtp_url` | SMTP server hostname | `mailcrab` |
| `smtp_port` | SMTP server port | `1025` |
| `smtp_credentials` | Optional SMTP credentials | `["user", "pw"]` |
| `allowed_origins` | Regex pattern for CORS allowed origins | `^http://localhost:8080$` |
| `pkg_url` | URL of the PostGuard PKG server | `https://postguard-main.cs.ru.nl/pkg` |

## Development

### Docker (recommended)

```bash
# Development setup (with hot reload via cargo watch)
docker-compose -f docker-compose.dev.yml up

# Production-like setup
docker-compose up
```

The development Docker Compose setup includes a Mailcrab instance for testing emails (web UI at `http://localhost:1080`, SMTP at port 1025).

### Manual Setup

#### Frontend

Requires Node.js 14 and Rust:

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
env ROCKET_ENV=development ROCKET_CONFIG=conf/config.dev.toml cargo watch -x run

# Production build
env ROCKET_ENV=production cargo build --release

# Run the production binary
env ROCKET_CONFIG=conf/config.toml ./target/release/cryptify-backend
```

The backend needs the `ROCKET_CONFIG` environment variable pointing to a configuration file so it can send emails and store files.

### Electron Packaging

The frontend can also be packaged as a desktop app:

```bash
cd cryptify-front-end
npm run dist-electron
```

## API

The backend exposes a file upload/download API. An OpenAPI 3.0 specification is available in `api-description.yaml` in the repository root. The main endpoints:

- `POST /fileupload/init` — Initialize a multipart file upload (takes sender email, recipient email, file size, mail content, and language).
- `PUT /fileupload/{uuid}` — Upload a file chunk (use `Content-Range` header for chunked uploads).
- `POST /fileupload/finalize/{uuid}` — Finalize the upload and send the notification email.
- `GET /filedownload/{uuid}` — Download a file.

## Releasing

This repository does not have automated releases.
