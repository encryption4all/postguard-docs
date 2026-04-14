# pg-curve

[GitHub](https://github.com/encryption4all/pg-curve) · Rust · Cryptographic Library

Fork of the [BLS12-381 pairing-friendly elliptic curve crate](https://github.com/zkcrypto/bls12_381) with target group serialization support. This crate exists because the upstream maintainers chose not to merge the proposed serialization standard ([PR #12](https://github.com/zkcrypto/bls12_381/pull/12)). It stays up to date with upstream, with the `gt-serialisation` branch merged in.

Published on [crates.io](https://crates.io/crates/pg_curve). API documentation is on [docs.rs/pg-curve](https://docs.rs/pg-curve).

Used by [ibe](/repos/ibe) as the underlying elliptic curve implementation.

## Cargo Features

| Feature | Default | Description |
|---|:---:|---|
| `groups` | yes | Group arithmetic |
| `pairings` | yes | Pairing operations |
| `alloc` | yes | Heap allocation support |
| `bits` | yes | Bit manipulation |
| `experimental` | no | Experimental features |
| `nightly` | no | Nightly-only optimizations |
| `zeroize` | no | Secure memory zeroing |

## Development

### Building

```bash
cargo build --all-features
```

### Testing

```bash
cargo test
```

### Doc Link Verification

```bash
cargo doc --document-private-items
```

### Build Checks

```bash
cargo build --benches --examples   # verify benchmarks and examples compile
```

## Releasing

See `RELEASES.md` in the repository for the full release history and changelog.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Push/PR | Tests, `no_std` target checks, doc link verification |
| `lints-stable.yml` | Push/PR | Clippy and rustfmt on stable |
| `lints-beta.yml` | Push/PR | Clippy on beta |
