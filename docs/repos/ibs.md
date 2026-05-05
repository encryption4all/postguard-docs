# ibs

[GitHub](https://github.com/encryption4all/ibs) · Rust · Cryptographic Library

Pure Rust implementations of identity-based signature (IBS) algorithms. Used by [postguard](/repos/postguard) (pg-core) for sender signatures, allowing recipients to verify who sent an encrypted message.

Published on [crates.io](https://crates.io/crates/ibs).

## Supported Schemes

Currently supports the **Galindo-Garcia** identity-based signature scheme.

## Cargo Features

| Feature | Default | Description |
|---|:---:|---|
| `serde` | yes | Adds `serde::Serialize` and `serde::Deserialize` derives on the exported structs. Not required for byte serialization, which is available through inherent methods (see below). |
| `zeroize` | yes | Enables `Zeroize` for secret exported structs |

MSRV is Rust 1.65, declared in `Cargo.toml`.

## Public API

The four exported types (`PublicKey`, `SecretKey`, `UserSecretKey`, and `Signature`) derive `Debug`, `Clone`, `PartialEq`, and `Eq`. Each provides inherent `to_bytes` and `from_bytes` methods. These work without the `serde` feature and stay `no_std`-compatible.

### Sizes and encodings

| Type | Bytes | Encoding |
|---|:---:|---|
| `PublicKey` | 32 | compressed Ristretto point |
| `SecretKey` | 32 | canonical scalar |
| `UserSecretKey` | 96 | `y` (32 bytes) `‖` `gr` compressed (32 bytes) `‖` `id` (32 bytes) |
| `Signature` | 96 | `ga` compressed (32 bytes) `‖` `b` (32 bytes) `‖` `gr` compressed (32 bytes) |

`from_bytes` returns `None` if a scalar field is non-canonical or a compressed point is invalid.

### PublicKey

```rust
impl PublicKey {
    /// Serialize the public key to its compressed byte encoding.
    pub fn to_bytes(&self) -> [u8; PK_BYTES] {
        self.0.compress().to_bytes()
    }

    /// Deserialize a public key from its compressed byte encoding.
    ///
    /// Returns `None` if `bytes` is not a valid compressed Ristretto point.
    pub fn from_bytes(bytes: &[u8; PK_BYTES]) -> Option<Self> {
        point_from_bytes(*bytes).map(PublicKey)
    }
}
```

<small>[Source: src/gg.rs#L129-L141](https://github.com/encryption4all/ibs/blob/c0fd27f2ecacbc81a60104b7e030d39e4780c605/src/gg.rs#L129-L141)</small>

### SecretKey

```rust
impl SecretKey {
    /// Serialize the secret key to its canonical byte encoding.
    pub fn to_bytes(&self) -> [u8; SK_BYTES] {
        self.0.to_bytes()
    }

    /// Deserialize a secret key from its canonical byte encoding.
    ///
    /// Returns `None` if `bytes` is not a canonical scalar encoding.
    pub fn from_bytes(bytes: &[u8; SK_BYTES]) -> Option<Self> {
        scalar_from_canonical(*bytes).map(SecretKey)
    }
}
```

<small>[Source: src/gg.rs#L143-L155](https://github.com/encryption4all/ibs/blob/c0fd27f2ecacbc81a60104b7e030d39e4780c605/src/gg.rs#L143-L155)</small>

### UserSecretKey

```rust
impl UserSecretKey {
    /// Serialize the user secret key to a 96-byte encoding.
    ///
    /// Layout: `y (32 bytes) || gr (32 bytes, compressed) || id (32 bytes)`.
    pub fn to_bytes(&self) -> [u8; USK_BYTES] {
        let mut out = [0u8; USK_BYTES];
        out[..32].copy_from_slice(&self.y.to_bytes());
        out[32..64].copy_from_slice(&self.gr.compress().to_bytes());
        out[64..96].copy_from_slice(&self.id.0);
        out
    }

    /// Deserialize a user secret key from its 96-byte encoding.
    ///
    /// Returns `None` if `y` is not a canonical scalar or if `gr` is not a
    /// valid compressed Ristretto point. See [`UserSecretKey::to_bytes`] for
    /// the encoding layout.
    pub fn from_bytes(bytes: &[u8; USK_BYTES]) -> Option<Self> {
        let mut y_bytes = [0u8; 32];
        let mut gr_bytes = [0u8; 32];
        let mut id_bytes = [0u8; IDENTITY_BYTES];
        y_bytes.copy_from_slice(&bytes[..32]);
        gr_bytes.copy_from_slice(&bytes[32..64]);
        id_bytes.copy_from_slice(&bytes[64..96]);

        let y = scalar_from_canonical(y_bytes)?;
        let gr = point_from_bytes(gr_bytes)?;

        Some(UserSecretKey {
            y,
            gr,
            id: Identity(id_bytes),
        })
    }
}
```

<small>[Source: src/gg.rs#L157-L191](https://github.com/encryption4all/ibs/blob/c0fd27f2ecacbc81a60104b7e030d39e4780c605/src/gg.rs#L157-L191)</small>

### Signature

```rust
impl Signature {
    /// Serialize the signature to a 96-byte encoding.
    ///
    /// Layout: `ga (32 bytes, compressed) || b (32 bytes) || gr (32 bytes, compressed)`.
    pub fn to_bytes(&self) -> [u8; SIG_BYTES] {
        let mut out = [0u8; SIG_BYTES];
        out[..32].copy_from_slice(&self.ga.compress().to_bytes());
        out[32..64].copy_from_slice(&self.b.to_bytes());
        out[64..96].copy_from_slice(&self.gr.compress().to_bytes());
        out
    }

    /// Deserialize a signature from its 96-byte encoding.
    ///
    /// Returns `None` if `ga` or `gr` is not a valid compressed Ristretto
    /// point or if `b` is not a canonical scalar encoding. See
    /// [`Signature::to_bytes`] for the encoding layout.
    pub fn from_bytes(bytes: &[u8; SIG_BYTES]) -> Option<Self> {
        let mut ga_bytes = [0u8; 32];
        let mut b_bytes = [0u8; 32];
        let mut gr_bytes = [0u8; 32];
        ga_bytes.copy_from_slice(&bytes[..32]);
        b_bytes.copy_from_slice(&bytes[32..64]);
        gr_bytes.copy_from_slice(&bytes[64..96]);

        let ga = point_from_bytes(ga_bytes)?;
        let b = scalar_from_canonical(b_bytes)?;
        let gr = point_from_bytes(gr_bytes)?;

        Some(Signature { ga, b, gr })
    }
}
```

<small>[Source: src/gg.rs#L193-L224](https://github.com/encryption4all/ibs/blob/c0fd27f2ecacbc81a60104b7e030d39e4780c605/src/gg.rs#L193-L224)</small>

The inherent API was added in [ibs#8](https://github.com/encryption4all/ibs/pull/8). [ibs#9](https://github.com/encryption4all/ibs/pull/9) declared MSRV 1.65 and added `PartialEq` / `Eq` on `Signature`.

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
