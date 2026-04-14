# ibe

[GitHub](https://github.com/encryption4all/ibe) · Rust · Cryptographic Library

Collection of Identity-Based Encryption (IBE) schemes on the [BLS12-381 pairing-friendly elliptic curve](https://github.com/zkcrypto/bls12_381). This crate provides the cryptographic foundation that [postguard](/repos/postguard) (pg-core) uses for encryption.

Published on [crates.io](https://crates.io/crates/ibe).

## Supported Schemes

The crate contains both identity-based encryption schemes (IBEs, in `src/pke`) and identity-based key encapsulation mechanisms (IBKEMs, in `src/kem`):

- **Waters** (IND-ID-CPA IBE)
- **Boyen-Waters** (IND-sID-CPA IBE)
- **Waters-Naccache** (IND-ID-CPA IBE)
- **Kiltz-Vahlis IBE1** (IND-CCA2 IBKEM)
- **Chen-Gay-Wee** (IND-ID-CPA IBE, IND-ID-CCA2 IBKEM)

References to the original papers appear in the respective source files.

## Technical Notes

- This implementation has not been audited. Use at your own risk.
- Uses [Keccak](https://crates.io/crates/tiny-keccak) for hashing to identities, hashing to secrets, and as symmetric primitives for the Fujisaki-Okamoto transform.
- Compiles on Rust stable.
- Does not use the Rust standard library (`no_std` compatible).
- All operations run in constant time.
- Byte serialization format is not guaranteed stable between releases.
- Performance depends primarily on the arithmetic in [pg-curve](/repos/pg-curve). Optimizations to pg-curve directly improve this crate's performance.

## Cargo Features

| Feature | Description |
|---|---|
| `boyen_waters` | Boyen-Waters IBE scheme |
| `cgw` | Chen-Gay-Wee IBE scheme |
| `cgwfo` | Chen-Gay-Wee with Fujisaki-Okamoto transform |
| `cgwkv` | Chen-Gay-Wee KEM variant |
| `kv1` | Kiltz-Vahlis IBE1 scheme |
| `waters` | Waters IBE scheme |
| `waters_naccache` | Waters-Naccache IBE scheme |
| `mkem` | Multi-user key encapsulation |

## Development

### Building

```bash
cargo build --release
```

### Testing

```bash
cargo test --release --all-features
```

## Releasing

Versions are published manually to crates.io.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Push/PR | Linting, tests on multiple OS, `no_std` checks (wasm32), all-features tests |
