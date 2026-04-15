# postguard-fallback

[GitHub](https://github.com/encryption4all/postguard-fallback) · Rust · Web Decryption Service

Also known as **TGuard**. A self-contained web service for sending and decrypting [irmaseal](https://github.com/encryption4all/irmaseal)-encrypted messages. Users encrypt messages client-side, and recipients can decrypt them in their browser after proving they own the required attributes (e.g., email address, name, or identifying number) via [Yivi](https://yivi.app) (formerly [IRMA](https://irma.app/docs/what-is-irma/)).

## Architecture

Both the backend and frontend are written in Rust:

- **Backend**: HTTP server built with [Rocket](https://rocket.rs/), handles message storage and Yivi session management, backed by PostgreSQL.
- **Frontend**: Browser application built with [Yew](https://yew.rs/) (compiled to WASM), bundled with [Trunk](https://trunkrs.dev/).

Supporting services: NGINX (reverse proxy), PostgreSQL (database), Mailhog (email testing).

The frontend is compiled and bundled using [Trunk](https://trunkrs.dev/) and uses the [Yew](https://yew.rs/) framework. Additional Rust library dependencies can be found in `Cargo.toml` in both the frontend and backend directories.

For a technical overview of IRMA Seal, see the [design document](https://github.com/Wassasin/irmaseal/blob/master/docs/design.md).

## Development

### Docker (recommended)

```bash
# Initialize the database
./setup.sh

# Development setup
docker-compose up
```

The application is available at `http://tguard.localhost`.

The Docker setup includes the following software versions: Rust 1.57 (rust:bullseye), NGINX 1.21, PostgreSQL 12, and Mailhog 1.0.

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
