# postguard-fallback

[GitHub](https://github.com/encryption4all/postguard-fallback) · Rust · Web Decryption Service

Also known as **TGuard**. A self-contained web service for sending and decrypting PostGuard-encrypted messages, designed as a fallback for users who don't have a PostGuard client installed. Users can decrypt messages directly in their browser after proving their identity via [Yivi](https://yivi.app) (formerly IRMA).

## Architecture

Both the backend and frontend are written in Rust:

- **Backend**: HTTP server built with [Rocket](https://rocket.rs/), handles message storage and Yivi session management, backed by PostgreSQL.
- **Frontend**: Browser application built with [Yew](https://yew.rs/) (compiled to WASM), bundled with [Trunk](https://trunkrs.dev/).

Supporting services: NGINX (reverse proxy), PostgreSQL (database), Mailhog (email testing).

## Development

### Docker (recommended)

```bash
# Development setup
docker-compose -f docker-compose.dev.yml up

# Production-like setup
docker-compose up

# Initialize the database
./setup.sh
```

The application is available at `http://tguard.localhost`.

### Manual Setup

Requires:

- Rust 1.57+
- `wasm32-unknown-unknown` target
- `trunk` and `wasm-bindgen-cli` cargo packages

```bash
rustup target add wasm32-unknown-unknown
cargo install trunk wasm-bindgen-cli
```

## Releasing

This repository does not have automated releases. Builds are handled via Docker.

## Funding

This project was funded through the NGI0 PET Fund, a fund established by NLnet with financial support from the European Commission's Next Generation Internet programme.
