# postguard

[GitHub](https://github.com/encryption4all/postguard) · Rust · Core library and services

The main PostGuard repository. It contains the core encryption library, the Private Key Generator (PKG) server, WebAssembly bindings for browsers, a command-line client, and FFI bindings for native language integration.

## Workspace Structure

The repository is a Rust workspace with five crates:

| Crate | Description |
|---|---|
| `pg-core` | Core library: metadata management, binary serialization, streaming encryption (with a WebCrypto-backed WASM backend under the `web` and `stream` features) |
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

- [Rust](https://www.rust-lang.org/tools/install) (stable)

### Building

```bash
cargo build --release
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

```bash
cargo run -p pg-pkg --release
```

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
