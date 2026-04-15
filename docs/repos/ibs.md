# ibs

[GitHub](https://github.com/encryption4all/ibs) · Rust · Cryptographic Library

Pure Rust implementations of identity-based signature (IBS) algorithms. Used by [postguard](/repos/postguard) (pg-core) for sender signatures, allowing recipients to verify who sent an encrypted message.

Published on [crates.io](https://crates.io/crates/ibs).

## Supported Schemes

Currently supports the **Galindo-Garcia** identity-based signature scheme.

## Cargo Features

| Feature | Default | Description |
|---|:---:|---|
| `serde` | yes | Enables serde serialization and deserialization for exported structs |
| `zeroize` | yes | Enables `Zeroize` for secret exported structs |

## Development

### Building

```bash
cargo build
```

### Testing

```bash
cargo test
```

### Benchmarks

```bash
cargo bench
```

## Releasing

Versions are published manually to crates.io.
