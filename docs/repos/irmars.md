# irmars

[GitHub](https://github.com/encryption4all/irmars) · Rust · Cryptographic Library

Rust library for interfacing with [Yivi](https://yivi.app) (formerly IRMA) servers. Used by [postguard](/repos/postguard) (`pg-core`, `pg-pkg`, `pg-cli`) to drive the Yivi session flow that issues identity-based decryption keys.

Published on [crates.io](https://crates.io/crates/irmars).

## Why the fork

Forked from [tweedegolf/irmars](https://github.com/tweedegolf/irmars), which has been dormant since 2021. The encryption4all fork was created to:

- Move to `reqwest` 0.12 and `thiserror` 2.0, clearing a stack of unmaintained transitive dependencies that the upstream pin held in place.
- Track current Yivi server behavior (irmago 0.19.2, scheme download from `schemes.yivi.app`).
- Restore an automated release pipeline (`release-plz`) and Conventional Commits enforcement so the crate can ship to crates.io on a predictable cadence.

## How postguard consumes it

`pg-core`, `pg-pkg`, and `pg-cli` depend on the crate from crates.io using Cargo's package rename so existing `use irma::...` call sites keep working without churn:

```toml
[dependencies]
irma = { package = "irmars", version = "0.2.2" }
```

<small>[Source: pg-core/Cargo.toml#L19](https://github.com/encryption4all/postguard/blob/f2f06cd5f5e24ba58f299547e8e78af0173944c7/pg-core/Cargo.toml#L19)</small>

The published crate name is `irmars`; the local crate alias remains `irma`. This was rolled out in [postguard#192](https://github.com/encryption4all/postguard/pull/192).

## Development

### Building

```bash
cargo build
```

### Testing

```bash
cargo test
```

## Releasing

Releases are automated via [release-plz](https://github.com/encryption4all/irmars/pull/1). Merging Conventional Commits to `main` opens a release PR; merging that PR tags the version and publishes to crates.io.
