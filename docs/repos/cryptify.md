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
| `session_ttl_secs` | Idle TTL for an in-flight upload session, in seconds. The eviction deadline resets on each successful chunk PUT or `/status` call. Defaults to `3600` (60 minutes) | `3600` |
| `staging_mode` | When `true`, `send_email` skips SMTP entirely and logs the intended email metadata at info level. The upload finalize still returns `Ok`. Defaults to `false`. Intended for staging deploys where real email delivery is undesirable | `false` |
| `usage_db` | Path to the SQLite database used for upload usage accounting | `/app/data/usage.db` |

The `chunk_size` setting caps the size of each `PUT /fileupload/{uuid}` body. Clients (such as `@e4a/pg-js` and the PostGuard website) use the same value for their upload chunks, so increasing it server-side without updating the client default will not produce larger chunks on its own.

<small>[Source: src/config.rs#L3-L36](https://github.com/encryption4all/cryptify/blob/ca6be91913d0313791c5bbeb3dd16152c85855c6/src/config.rs#L3-L36)</small>

### Staging mode

Set `staging_mode = true` in the active config file (for example `conf/config.toml`) to skip SMTP for a whole deploy. With staging mode on, `POST /fileupload/finalize/{uuid}` still completes normally and returns `Ok`; the recipient email is replaced by a single info-level log line of the form:

```
[STAGING] Email NOT sent (staging_mode=true). Would have notified recipients=[...] from sender=... (attributes=[...]) lang=... expires=... confirm=... notify_recipients=... download_url=... uuid=...
```

The line carries the same recipients, sender, sender attributes, language, expiry, confirmation flag, notify-recipients flag, download URL, and UUID that a real notification would have used, so a staging deploy can be exercised end to end without delivering mail.

The `smtp_url`, `smtp_port`, `smtp_username`, `smtp_password`, and `smtp_tls` settings are ignored while `staging_mode` is on, so they can stay unset in a staging environment.

<small>[Source: src/email.rs#L191-L198, L294-L337](https://github.com/encryption4all/cryptify/blob/ca6be91913d0313791c5bbeb3dd16152c85855c6/src/email.rs#L191-L198)</small>

## Upload limits

Cryptify enforces three independent limits on every upload. They are constants in `src/store.rs`, not config options.

| Limit | Default tier | API-key tier | Notes |
|---|---|---|---|
| Per-chunk size | `chunk_size` from config (default 5 MB) | same as default | Bigger chunks are rejected with `400 Bad Request`. |
| Per-upload size | 5 GB | 100 GB | Total bytes for a single upload session. |
| Rolling window total | 5 GB per 14 days | 100 GB per 14 days | Default tier accounts per sender email; API-key tier accounts per tenant id. |

The default tier identifies the sender by the email attribute disclosed in the encrypted envelope's signature. The API-key tier accounts on the validated tenant id (`api-key:<organizations.id>`) so a single tenant cannot evade quota by varying sender attributes. See [Authentication for the higher tier](#authentication-for-the-higher-tier) below.

The rolling window only counts finalized uploads.

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

`GET /usage` returns the current state for the authenticated sender, including `used_bytes`, `limit_bytes`, `per_upload_limit_bytes`, `window_days`, and `resets_at`. When the request includes a validated `Authorization: Bearer PG-…`, the response describes the per-tenant bucket (`api-key:<tenant>`); otherwise it describes the per-email bucket.

<small>[Source: src/store.rs#L11-L15](https://github.com/encryption4all/cryptify/blob/58883a86b369af08d92db93aa1025f9eba3c73eb/src/store.rs#L11-L15)</small>

## Authentication for the higher tier

Callers unlock the API-key tier by sending `Authorization: Bearer PG-…` on every upload request (`init`, each chunk PUT, and `finalize`). The key is a PostGuard for Business API key issued through the [postguard-business](/repos/postguard-business) portal.

Cryptify itself does not own the key allowlist. On `init` it forwards the bearer to PKG's `GET /v2/api-key/validate`, which authenticates against the shared `business_api_keys` table and returns the tenant id (`organizations.id`). Cryptify uses that id for tier selection and as the rolling-window accounting key. Validation runs only at `init` — once the upload session is established, the tier and accounting key are fixed for its lifetime.

| Validation outcome | Tier applied | Behaviour on cap exceeded |
|---|---|---|
| No `Authorization` header / non-PG bearer | Default | `413 Payload Too Large` |
| PKG returns `2xx` with tenant id | API-key | `413 Payload Too Large` (at 100 GB) |
| PKG returns `401`/`403` (unknown or expired key) | Default | `413 Payload Too Large` |
| PKG unreachable for the full retry budget | Default + warning | **`503 Service Unavailable`** when the upload exceeds the default 5 GB cap; `413` otherwise behaviour matches default |

The PKG retry budget at `init` is 30 seconds with exponential backoff (250 ms → 5 s ceiling). Authoritative responses (`2xx` with body, `401`, `403`) short-circuit the retry loop. Connection errors and `5xx` are retried until the budget is exhausted.

The 503 response distinguishes "we couldn't tell whether you should have gotten the higher tier" from the regular 413 ("you're over your tier's cap"). Smaller uploads degrade silently to the default tier with a warning logged on the server, so transient PKG outages don't block uploads that would have fit anyway.

The legacy `X-Api-Key` header is no longer recognised; older clients that still send it are treated as default tier.

<small>[Source: src/main.rs](https://github.com/encryption4all/cryptify/blob/2a6dac195ef4efae8758084aaacab04bc9c94206/src/main.rs)</small>

## API

Cryptify exposes a file upload/download API. An OpenAPI 3.0 specification is available in `api-description.yaml` in the repository root. The main endpoints:

- `POST /fileupload/init`: Initialize a multipart file upload. The JSON body takes `recipient`, `mailContent`, `mailLang`, `confirm`, and the optional `notifyRecipients`.
- `PUT /fileupload/{uuid}`: Upload a file chunk (use `Content-Range` header for chunked uploads).
- `POST /fileupload/finalize/{uuid}`: Finalize the upload (sends the recipient notification email if `notifyRecipients` was `true` on init).
- `GET /fileupload/{uuid}/status`: Read rolling-token state to resume an in-flight upload across a page refresh or tab crash. Authenticated via `X-Recovery-Token`.
- `GET /filedownload/{uuid}`: Download a file. Supports resumable downloads via the HTTP `Range` header (see [Range support on `/filedownload`](#range-support-on-filedownload) below).

### `POST /fileupload/init` request body

| Field | Type | Required | Description |
|---|---|---|---|
| `recipient` | string (email) | yes | Recipient email address. |
| `mailContent` | string | yes | Body text included in the recipient and confirmation emails. |
| `mailLang` | string | yes | Email language. `EN` or `NL`. |
| `confirm` | boolean | yes | Send a confirmation email to the sender. |
| `notifyRecipients` | boolean | no | Email each recipient with a download link. Defaults to `true` when omitted, for backward compatibility. Set to `false` to upload silently when the encrypted payload reaches the recipient through another channel. |

The `notifyRecipients` field was added in cryptify 0.9 (see [encryption4all/cryptify#135](https://github.com/encryption4all/cryptify/pull/135)). Direct API callers that omit it keep the original notify-on-finalize behaviour. SDK callers (`@e4a/pg-js` 1.2.0+, `E4A.PostGuard` 0.3.0+) send `false` explicitly so the silent-by-default semantics hold regardless of the cryptify version on the other end.

<small>[Source: api-description.yaml#L33-L72](https://github.com/encryption4all/cryptify/blob/723c8db10420180e50a5d97bb852794683c9544d/api-description.yaml#L33-L72)</small>

### `POST /fileupload/init` response body

The init response is JSON and includes the upload UUID and a recovery token:

| Field | Type | Description |
|---|---|---|
| `uuid` | string (uuid) | Upload identifier used in subsequent chunk PUTs and finalize. |
| `recovery_token` | string (hex, 32 bytes) | Bearer credential for `GET /fileupload/{uuid}/status`. Clients should store it alongside the UUID (for example in IndexedDB) and present it in an `X-Recovery-Token` header to rehydrate after a page refresh, tab crash, or navigate-away-and-back. |

The `cryptifytoken` response header carries the initial rolling token for the first chunk PUT.

<small>[Source: api-description.yaml#L82-L103](https://github.com/encryption4all/cryptify/blob/4c30e539a04be1dc08cc1704de35f1ad4320c5af/api-description.yaml#L82-L103)</small>

### `GET /fileupload/{uuid}/status`

Returns the rolling-token state of an in-flight upload so a client that lost track of the session can resume. The response body has `uploaded` (bytes committed so far), `cryptify_token` (the value to send as `cryptifytoken` on the next chunk PUT), and once at least one chunk has been committed, `prev_token` and `prev_offset` for the idempotent-retry path described below.

Authentication uses the `X-Recovery-Token` header issued at init. The token is compared in constant time:

- Missing or empty header: `401`.
- A token that does not match the stored value: `404` with the same `upload_session_not_found` body as a real unknown UUID. The two cases are deliberately collapsed so callers cannot probe for live UUIDs by varying the token.

A successful call also resets the session's idle eviction deadline, so the next chunk PUT will not 404 because the rehydrate window aged out.

If two clients hold the same UUID and recovery token (two open tabs, say), there is no server-side lease. The first chunk PUT to land wins and the second sees a 4xx as soon as it tries to advance past the now-stale state.

<small>[Source: api-description.yaml#L258-L319](https://github.com/encryption4all/cryptify/blob/4c30e539a04be1dc08cc1704de35f1ad4320c5af/api-description.yaml#L258-L319)</small>

### Missing-upload-session 404 body

`PUT /fileupload/{uuid}`, `POST /fileupload/finalize/{uuid}`, and `GET /fileupload/{uuid}/status` return a JSON body on 404. The status code is unchanged, so older clients see the same wire behaviour:

```json
{
  "error": "upload_session_not_found",
  "uuid": "…",
  "reason": "expired_or_unknown"
}
```

`reason` is one of:

- `expired_or_unknown`: the session was evicted after its idle TTL or never existed. Clients cannot tell these apart, by design.
- `invalid_uuid`: the path UUID is malformed.
- `file_missing`: the in-memory session exists but the on-disk file is gone (server-state inconsistency).

Clients should not retry — start a new upload via `/fileupload/init`.

<small>[Source: api-description.yaml#L444-L472](https://github.com/encryption4all/cryptify/blob/4c30e539a04be1dc08cc1704de35f1ad4320c5af/api-description.yaml#L444-L472)</small>

### Idempotent chunk retry

A chunk PUT whose response was lost in flight can be safely retried. The client re-issues the request with the *previous* `cryptifytoken` (the value sent on the failed attempt), the same `Content-Range`, and the same body bytes. The server matches the request against the cached `(prev_token, offset, length, sha256)` of the most recently committed chunk and replays the previously returned `cryptifytoken` without rewriting the file or double-counting against quotas.

If the request looks like a retry but the body bytes differ, the server responds 400. Clients must not retry the same offset with different bytes. Retries are only honoured for the most recently committed chunk; a client that has fallen behind by more than one chunk must start a new upload.

The `prev_token` and `prev_offset` fields on `GET /fileupload/{uuid}/status` exist to feed exactly this path after a refresh.

<small>[Source: api-description.yaml#L109-L124](https://github.com/encryption4all/cryptify/blob/4c30e539a04be1dc08cc1704de35f1ad4320c5af/api-description.yaml#L109-L124)</small>

### Range support on `/filedownload`

`GET /filedownload/{uuid}` honours inbound `Range` headers so browsers and other clients can resume an interrupted download instead of restarting from byte zero. Every response sets `Accept-Ranges: bytes`.

| Request | Response |
|---|---|
| No `Range` header | `200 OK` with `Content-Length` and the full body. |
| `Range: bytes=N-M`, `bytes=N-`, or `bytes=-N` | `206 Partial Content` with `Content-Range: bytes start-end/total` and the requested slice. Open-ended and suffix forms are clamped to the file size. |
| Unsatisfiable or malformed range | `416 Range Not Satisfiable` with `Content-Range: bytes */total`. |
| Multi-range (`bytes=0-9,20-29`) | Rejected as malformed; the server returns `416`. `multipart/byteranges` is intentionally unsupported. |

The CORS preflight allowlist on the service includes `Range` alongside `Authorization`, `Content-Type`, `Content-Range`, `CryptifyToken`, and `X-Recovery-Token`, so browser `fetch` calls can send the header.

<small>[Source: src/main.rs#L959-L1083](https://github.com/encryption4all/cryptify/blob/b1eff690eae096d4cec55e7dbf323d8d0c3d74c0/src/main.rs#L959-L1083)</small>

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
