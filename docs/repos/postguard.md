# postguard

[GitHub](https://github.com/encryption4all/postguard) · Rust · Core library and services

The main PostGuard repository. It contains the core encryption library, the Private Key Generator (PKG) server, WebAssembly bindings for browsers, a command-line client, and FFI bindings for native language integration.

The repo also includes a [Docusaurus documentation site](https://encryption4all.github.io/postguard/) in the `website/` directory, covering architecture, API reference, and Yivi integration. That content has been consolidated into this centralized docs site.

## Workspace Structure

The repository is a Rust workspace with five crates:

| Crate | Description |
|---|---|
| `pg-core` | Core library: metadata management, binary serialization, streaming encryption (with a WebCrypto-backed WASM backend under the `web` and `stream` features) |
| `pg-pkg` | HTTP API server (Actix-web) that runs a Private Key Generator instance |
| `pg-wasm` | WebAssembly bindings via `wasm-pack`, used by the JavaScript SDK |
| `pg-cli` | Command-line tool for encrypting and decrypting files |
| `pg-ffi` | FFI bindings for calling Rust code from other languages (used by [postguard-dotnet](/repos/postguard-dotnet)) |

The `website/` directory contains a Docusaurus site deployed to GitHub Pages via the `docs.yml` workflow.

## How It Works

PostGuard uses Identity-Based Encryption (IBE). Instead of public keys, the sender only needs the master public key and the recipient's identity (e.g. email address). To decrypt, the recipient proves their identity to the PKG via [Yivi](https://yivi.app) and receives a decryption key.

A typical session:

0. The PKG generates a master key pair.
1. The sender's client fetches the public master key from the PKG.
2. The sender encrypts a message using the master public key and the recipient's identity.
3. The ciphertext is sent to the recipient (through any channel).
4. The recipient's client requests a decryption key from the PKG.
5. The PKG starts a Yivi authentication session.
6. The recipient proves their identity with the Yivi app.
7. The PKG issues a decryption key for that identity.
8. The recipient's client decrypts the message.

For the full protocol details, see the [architecture overview](/guide/architecture) and [core concepts](/guide/concepts) in the guide.

### Cryptographic Primitives

| Primitive | Implementation |
|---|---|
| KEM | CGW-KV anonymous IBE on BLS12-381 ([`ibe`](https://crates.io/crates/ibe) crate) |
| IBS | GG identity-based signatures ([`ibs`](https://crates.io/crates/ibs) crate) |
| Symmetric | AES-128-GCM (128-bit security to match BLS12-381) |
| Hashing | SHA3-512 for identity derivation |

### pg-core Feature Flags

pg-core supports two backends:

- `rust` (default): uses RustCrypto crates for native Rust targets
- `web`: uses the Web Crypto API for WASM in browsers

Streaming mode is enabled with the `stream` feature flag. When active, encryption and decryption process data in 256 KiB chunks instead of loading everything into memory.

## Development

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable, 1.90.0 or later)
- Docker and Docker Compose (for the local development environment)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) (only for WASM development)

```bash
# Install wasm-pack (if working on pg-wasm)
cargo install --git https://github.com/rustwasm/wasm-pack.git
```

### Building

```bash
# Build the full workspace
cargo build --release

# Build individual crates
cargo build --release -p pg-core
cargo build --release --bin pg-cli
cargo build --release --bin pg-pkg
```

### Building WASM Bindings

```bash
cd pg-wasm
wasm-pack build --release -d pkg/ --out-name index --scope e4a --target bundler
```

For web target (without a bundler):

```bash
wasm-pack build --release -d pkg/ --out-name index --scope e4a --target web
```

### Testing

```bash
# Run all workspace tests
cargo test

# pg-core with all test features
cargo test -p pg-core --features test,rust,stream

# WASM tests (requires wasm-pack)
wasm-pack test --release --headless --chrome ./pg-wasm
wasm-pack test --release --headless --firefox ./pg-wasm
```

### Running the PKG Server

Generate a master key pair first (run once):

```bash
cargo run --release --bin pg-pkg gen
```

Then start the server:

```bash
cargo run --release --bin pg-pkg server \
  -t <irma_server_token> \
  -i <irma_server_url> \
  -d <postgres_connection_string>
```

Or run via Docker:

```bash
docker build -t postguard-pkg .
docker run -p 8080:8080 postguard-pkg server \
  -t <irma_token> \
  -i <irma_url> \
  -d <postgres_url>
```

### Local Development Environment

Docker Compose starts PostgreSQL and a Yivi (IRMA) server for local development:

```bash
docker-compose up
```

Then run the PKG server against the local services:

```bash
cargo run --release --bin pg-pkg server \
  -d postgres://devuser:devpassword@localhost/devdb \
  -t <irma_token> \
  -i http://localhost:8088
```

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `IRMA_SERVER` | Yivi/IRMA server URL | `https://is.yivi.app` |
| `DATABASE_URL` | PostgreSQL connection string | (required) |
| `RUST_LOG` | Log level (`debug`, `info`, `warn`, `error`) | (none) |

### Using the CLI

Encrypt a file:

```bash
cargo run --bin pg-cli enc \
  -i '{"recipient@example.com": [{"t": "pbdf.sidn-pbdf.email.email", "v": "recipient@example.com"}]}' \
  --pub-sign-id '[{"t": "pbdf.gemeente.personalData.fullname"}]' \
  myfile.txt
```

This starts a Yivi session (displays a QR code) to obtain signing keys, then encrypts `myfile.txt` into `myfile.txt.enc`.

Decrypt a file:

```bash
cargo run --bin pg-cli dec myfile.txt.enc
```

The CLI shows the recipient policies in the header, prompts you to select your identity, and starts a Yivi session to obtain your decryption key.

## PKG Server API

The PKG server (`pg-pkg`) exposes an HTTP API. By default it listens on `http://localhost:8080`.

### Public Parameters

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v2/parameters` | Fetch the Master Public Key (MPK). Supports ETag/Cache-Control caching. |
| `GET` | `/v2/sign/parameters` | Fetch the public verification key for signature checking. |

### Yivi Sessions

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v2/irma/start` | Start a Yivi identity verification session. |
| `GET` | `/v2/irma/jwt/{token}` | Retrieve the JWT result of a completed Yivi session. |

### Key Issuance

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v2/irma/key/{timestamp}` | Retrieve a User Secret Key (USK). Requires `Authorization: Bearer <jwt>`. |
| `POST` | `/v2/irma/sign/key` | Retrieve signing keys. Authenticate with a Yivi JWT or API key (`PG-API-<key>`). |

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check. |
| `GET` | `/metrics` | Prometheus metrics. |

For the full API details with request/response examples, see the [architecture page](/guide/architecture#api-endpoints).

## WASM Bindings (pg-wasm)

The `@e4a/pg-wasm` package provides WebAssembly bindings for PostGuard in browser environments. Install via npm:

```bash
npm install @e4a/pg-wasm
```

The package exports:

- `seal()` and `sealStream()` for encryption (in-memory and streaming)
- `Unsealer` and `StreamUnsealer` for decryption (in-memory and streaming)

Both streaming variants use the Web Streams API (`ReadableStream`/`WritableStream`). For usage examples and the full JavaScript/TypeScript API, see the [SDK reference](/sdk/overview).

## Releasing

This repository uses [Release-plz](https://release-plz.ieni.dev/) for automated versioning and releases. When changes are merged to `main`, Release-plz creates a release PR. Merging that PR triggers:

1. Crate publishing to [crates.io](https://crates.io/) (pg-core, pg-cli)
2. GitHub releases with changelogs
3. npm publishing of `pg-wasm`
4. Multi-architecture Docker image for `pg-pkg` (pushed to GHCR)
5. Platform-specific native libraries for `pg-ffi` (linux-x64, linux-arm64, osx-x64, osx-arm64, win-x64)

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `build.yml` | Push/PR | Formatting checks, tests for all workspace members |
| `delivery.yml` | Push to main | Release-plz, Docker build, FFI compilation, npm publish |
| `docs.yml` | Push to main | Builds the Docusaurus site in `website/` and deploys to [GitHub Pages](https://encryption4all.github.io/postguard/) |
