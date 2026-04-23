# cryptify

[GitHub](https://github.com/encryption4all/cryptify) · Rust · File Sharing Service

Cryptify is the file encryption and sharing service that PostGuard uses for delivering encrypted files. It allows encrypting any file with an identity attribute. Only people who can prove they have that attribute can decrypt and view the contents.

The [PostGuard website](/repos/postguard-website) and the [JavaScript SDK](/repos/postguard-js) use Cryptify as the default file storage and delivery backend.

Cryptify is a Rust service built on the Rocket framework. It handles file storage, chunked uploads, email notifications, and serves the API.

## Configuration

Cryptify reads its configuration from a TOML file. Example configuration files are in `conf/`. Set the `ROCKET_CONFIG` environment variable to point to the configuration file.

Configuration parameters:

| Parameter | Description | Example |
|---|---|---|
| `server_url` | Public URL of the service | `http://localhost:8080/` |
| `address` | Bind address | `0.0.0.0` |
| `port` | Listen port | `8000` |
| `data_dir` | Directory for storing uploaded files | `/tmp/data` |
| `email_from` | Sender address for notification emails | `noreply@postguard.local` |
| `smtp_url` | SMTP server hostname | `mailcrab` |
| `smtp_port` | SMTP server port | `1025` |
| `smtp_tls` | Enable TLS for SMTP | `false` |
| `smtp_username` | Optional SMTP username | `user` |
| `smtp_password` | Optional SMTP password | `pw` |
| `allowed_origins` | Regex pattern for CORS allowed origins | `^https?://(localhost\|127\\.0\\.0\\.1)(:[0-9]+)?$` |
| `pkg_url` | URL of the PostGuard PKG server | `http://postguard-pkg:8087` |

## API

Cryptify exposes a file upload/download API. An OpenAPI 3.0 specification is available in `api-description.yaml` in the repository root. The main endpoints:

- `POST /fileupload/init`: Initialize a multipart file upload (takes sender email, recipient email, file size, mail content, and language).
- `PUT /fileupload/{uuid}`: Upload a file chunk (use `Content-Range` header for chunked uploads).
- `POST /fileupload/finalize/{uuid}`: Finalize the upload and send the notification email.
- `GET /filedownload/{uuid}`: Download a file.

## Development

### Docker (recommended)

```bash
# Development setup
docker-compose -f docker-compose.dev.yml up

# Production-like setup
docker-compose up
```

### Manual Setup

Requires Rust.

#### Building and running

```bash
# Development (with auto-reload)
env ROCKET_ENV=development ROCKET_CONFIG=conf/config.dev.toml cargo watch -x run

# Production build
env ROCKET_ENV=production cargo build --release

# Run the built binary
env ROCKET_CONFIG=conf/config.toml ./target/release/cryptify
```

## Releasing

This repository uses [Release-plz](https://release-plz.ieni.dev/) for automated versioning. Merging a release PR triggers a multi-architecture Docker image build.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Push to main | Release-plz PR/release, multi-arch Docker build |
