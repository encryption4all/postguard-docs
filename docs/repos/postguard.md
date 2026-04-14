# postguard

[GitHub](https://github.com/encryption4all/postguard) · Rust · Core library and services

::: warning
This implementation has not been audited. Use at your own risk.
:::

The main PostGuard repository. It contains the core encryption library, the Private Key Generator (PKG) server, WebAssembly bindings for browsers, a command-line client, and FFI bindings for native language integration.

## Workspace Structure

The repository is a Rust workspace with five crates:

| Crate | Description |
|---|---|
| `pg-core` | Core library: metadata management, binary serialization, streaming encryption. Supports a native Rust backend (`rust` feature) and a WebCrypto-backed WASM backend (`web` + `stream` features). |
| `pg-pkg` | HTTP API server (Actix-web) that runs a Private Key Generator instance |
| `pg-wasm` | WebAssembly bindings via `wasm-pack`, used by the JavaScript SDK |
| `pg-cli` | Command-line tool for encrypting and decrypting files |
| `pg-ffi` | FFI bindings for calling Rust code from other languages (used by [postguard-dotnet](/repos/postguard-dotnet)) |

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

## Development

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) 1.90+ (stable)
- [Docker & Docker Compose](https://docs.docker.com/) for the development environment (PostgreSQL + Yivi server)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) (only for building the WASM bindings)

### Building

```bash
# Full workspace
cargo build --release

# Individual crates
cargo build --release -p pg-core
cargo build --release --bin pg-cli
cargo build --release --bin pg-pkg
```

### WASM Bindings

```bash
cd pg-wasm
wasm-pack build --release -d pkg/ --out-name index --scope e4a --target bundler
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

### Development Environment

Docker Compose starts PostgreSQL and a Yivi (IRMA) server:

```bash
docker-compose up
```

### Running the PKG Server

```bash
# Generate master key pair (run once)
cargo run --release --bin pg-pkg gen

# Start the server
cargo run --release --bin pg-pkg server \
  -t <irma_server_token> \
  -i <irma_server_url> \
  -d <postgres_connection_string>
```

When using Docker Compose for local development:

```bash
cargo run --release --bin pg-pkg server \
  -d postgres://devuser:devpassword@localhost/devdb \
  -t <irma_token> \
  -i http://localhost:8088
```

#### PKG Environment Variables

| Variable | Description |
|---|---|
| `IRMA_SERVER` | Yivi/IRMA server URL (default: `https://is.yivi.app`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `RUST_LOG` | Log level (`debug`, `info`, `warn`, `error`) |

### Using the CLI

#### Encrypt a file

```bash
cargo run --bin pg-cli enc \
  -i '{"recipient@example.com": [{"t": "pbdf.sidn-pbdf.email.email", "v": "recipient@example.com"}]}' \
  --pub-sign-id '[{"t": "pbdf.gemeente.personalData.fullname"}]' \
  myfile.txt
```

This starts a Yivi session (displays a QR code) to obtain signing keys, then encrypts `myfile.txt` into `myfile.txt.enc`.

#### Decrypt a file

```bash
cargo run --bin pg-cli dec myfile.txt.enc
```

The CLI shows the recipient policies in the header, prompts you to select your identity, and starts a Yivi session to obtain your decryption key.

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
| `docs.yml` | Push to main | Deploys API docs to GitHub Pages |

## Docusaurus Site

The repository contains a [Docusaurus](https://docusaurus.io/) documentation site in the `website/` directory, deployed to [encryption4all.github.io/postguard](https://encryption4all.github.io/postguard/). It covers the architecture, encryption/decryption flow, Yivi integration, PKG server API, and WASM bindings in detail. The content from that site has been consolidated into this centralized documentation.

## Funding

Development of PostGuard was initially funded by the [Next Generation Internet initiative (NGI0)](https://nlnet.nl/NGI0/) and [NLnet](https://nlnet.nl/). The project is currently funded by a 4-year project from [NWO](https://www.nwo.nl/) under the name "Encryption 4 All".
