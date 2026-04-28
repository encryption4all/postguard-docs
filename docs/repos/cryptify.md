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
| `chunk_size` | Maximum size in bytes of a single upload chunk. Defaults to `5000000` (5 MB) | `5000000` |
| `usage_db` | Path to the SQLite database used for upload usage accounting | `/app/data/usage.db` |

The `chunk_size` setting caps the size of each `PUT /fileupload/{uuid}` body. Clients (such as `@e4a/pg-js` and the PostGuard website) use the same value for their upload chunks, so increasing it server-side without updating the client default will not produce larger chunks on its own.

<small>[Source: src/config.rs](https://github.com/encryption4all/cryptify/blob/a31dbf1bdff1d2a8776a15a1581f3d48c89f4f9d/src/config.rs)</small>

## Upload limits

Cryptify enforces three independent limits on every upload. They are constants in `src/store.rs`, not config options.

| Limit | Anonymous senders | API-key senders | Notes |
|---|---|---|---|
| Per-chunk size | `chunk_size` from config (default 5 MB) | same as anonymous | Bigger chunks are rejected with `400 Bad Request`. |
| Per-upload size | 5 GB | 100 GB | Total bytes for a single upload session. |
| Rolling window total | 5 GB per 14 days | 100 GB per 14 days | Sum of all uploads from the same sender email in the trailing 14 days. |

A sender is identified by the email attribute disclosed in the encrypted envelope's signature. The rolling window only counts finalized uploads.

When a request would push the sender over the per-upload or the rolling-window limit, the server responds with `413 Payload Too Large` and a JSON body:

```json
{
  "error": "Sender has exceeded the 14-day rolling limit of 5000000000 bytes",
  "limit": "rolling_window",
  "used_bytes": 4800000000,
  "limit_bytes": 5000000000,
  "resets_at": "2026-05-09T12:34:56Z"
}
```

`limit` is either `"per_upload"` or `"rolling_window"`. `resets_at` is an RFC 3339 timestamp for when the oldest counted upload expires from the rolling window. It is `null` for `per_upload` rejections, since the per-upload limit does not reset.

`GET /usage` returns the current state for the authenticated sender, including `used_bytes`, `limit_bytes`, `per_upload_limit_bytes`, `window_days`, and `resets_at`.

<small>[Source: src/store.rs#L11-L15](https://github.com/encryption4all/cryptify/blob/58883a86b369af08d92db93aa1025f9eba3c73eb/src/store.rs#L11-L15)</small>

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
