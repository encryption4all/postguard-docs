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

## Cryptographic Primitives

- **KEM**: CGW-KV anonymous IBE scheme on BLS12-381 (from the [`ibe`](/repos/ibe) crate)
- **IBS**: GG identity-based signatures (from the [`ibs`](/repos/ibs) crate)
- **Symmetric**: AES-128-GCM (128-bit security to match BLS12-381)
- **Hashing**: SHA3-512 for identity derivation

## Development

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) 1.90.0 or later
- Docker and Docker Compose (for the development environment with PostgreSQL and Yivi server)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) (only needed for WASM bindings)

```bash
# Install Rust
curl https://sh.rustup.rs -sSf | sh

# Install wasm-pack (for WASM development only)
cargo install --git https://github.com/rustwasm/wasm-pack.git
```

### Building

```bash
# Build the entire workspace
cargo build --release

# Build individual crates
cargo build --release -p pg-core
cargo build --release --bin pg-cli
cargo build --release --bin pg-pkg
```

### WASM Bindings

```bash
cd pg-wasm
wasm-pack build --release -d pkg/ --out-name index --scope e4a --target bundler

# For web target (without a bundler)
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

### Development Environment

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
| `DATABASE_URL` | PostgreSQL connection string | — |
| `RUST_LOG` | Log level (`debug`, `info`, `warn`, `error`) | — |

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

Docker:

```bash
docker build -t postguard-pkg .
docker run -p 8080:8080 postguard-pkg server \
  -t <irma_token> \
  -i <irma_url> \
  -d <postgres_url>
```

## CLI Usage

### Encrypt a file

```bash
cargo run --bin pg-cli enc \
  -i '{"recipient@example.com": [{"t": "pbdf.sidn-pbdf.email.email", "v": "recipient@example.com"}]}' \
  --pub-sign-id '[{"t": "pbdf.gemeente.personalData.fullname"}]' \
  myfile.txt
```

This starts a Yivi session (displays a QR code) to obtain signing keys, then encrypts `myfile.txt` into `myfile.txt.enc`.

### Decrypt a file

```bash
cargo run --bin pg-cli dec myfile.txt.enc
```

The CLI shows the recipient policies in the header, prompts you to select your identity, and starts a Yivi session to obtain your decryption key.

## PKG Server API

The PKG server (`pg-pkg`) exposes an HTTP API. By default it listens on `http://localhost:8080`.

### Get Public Parameters

```
GET /v2/parameters
```

Returns the master public key (IBE) used by senders to encrypt messages.

### Get Verification Key

```
GET /v2/sign/parameters
```

Returns the public verification key (IBS) used to verify sender signatures.

### Start Yivi Session

```
POST /v2/irma/start
```

Initiates a Yivi disclosure session for obtaining decryption keys or signing keys.

Request body:

```json
{
  "attr": {
    "recipient@example.com": {
      "t": 1234567890,
      "con": [
        {"t": "pbdf.sidn-pbdf.email.email", "v": "recipient@example.com"}
      ]
    }
  }
}
```

### Retrieve Session JWT

```
GET /v2/irma/jwt/{token}
```

Retrieves the signed JWT from the IRMA server after a successful disclosure session.

### Get Decryption Key (USK)

```
GET /v2/irma/key/{timestamp}
```

Issues a User Secret Key for decryption. Requires a valid JWT as a Bearer token.

### Get Signing Keys

```
POST /v2/irma/sign/key
```

Issues signing keys for a sender. Requires a JWT Bearer token or an API key (`Authorization: PG-API-<key>`).

Request body:

```json
{
  "pubSignId": [
    {"t": "pbdf.gemeente.personalData.fullname"}
  ],
  "privSignId": [
    {"t": "pbdf.sidn-pbdf.email.email"}
  ]
}
```

### Authentication

The PKG supports two authentication methods:

- **JWT (Yivi Sessions)**: After a Yivi disclosure, the IRMA server issues a JWT. Pass it as `Authorization: Bearer <jwt>`.
- **API Keys**: For server-to-server use, API keys bypass interactive Yivi sessions. Pass as `Authorization: PG-API-<key>`. Keys are stored in PostgreSQL with pre-configured attributes.

## WASM Bindings API

The `@e4a/pg-wasm` npm package provides WebAssembly bindings for browsers. It supports both in-memory and streaming encryption/decryption using the Web Crypto API.

```bash
npm install @e4a/pg-wasm
```

### Encryption

In-memory:

```typescript
import init, { seal } from '@e4a/pg-wasm';
await init();

const ciphertext = seal(masterPublicKey, {
  policy: {
    "recipient@example.com": {
      t: Math.floor(Date.now() / 1000),
      con: [{ t: "pbdf.sidn-pbdf.email.email", v: "recipient@example.com" }]
    }
  },
  pubSignKey: publicSigningKey,
  privSignKey: privateSigningKey,
}, plaintext);
```

Streaming:

```typescript
import { sealStream } from '@e4a/pg-wasm';
await sealStream(masterPublicKey, sealOptions, readableStream, writableStream);
```

### Decryption

In-memory:

```typescript
import { Unsealer } from '@e4a/pg-wasm';
const unsealer = Unsealer.new(ciphertextBytes, verificationKey);
const recipients = unsealer.inspect_header();
const { plaintext, policy } = unsealer.unseal(recipientId, userSecretKey);
```

Streaming:

```typescript
import { StreamUnsealer } from '@e4a/pg-wasm';
const unsealer = await StreamUnsealer.new(readableStream, verificationKey);
const recipients = unsealer.inspect_header();
const verifiedPolicy = await unsealer.unseal(recipientId, userSecretKey, writableStream);
```

## Wire Format

PostGuard ciphertexts follow a binary wire format (V3):

```
PREAMBLE (10 bytes)
  PRELUDE      (4 bytes): 0x14 0x8A 0x8E 0xA7
  VERSION      (2 bytes): u16 big-endian (currently 0x0002)
  HEADER_LEN   (4 bytes): u32 big-endian

HEADER (variable)
  Header struct (bincode-serialized, max 1 MiB)
  SIG_LEN      (4 bytes): u32 big-endian
  HEADER_SIG   (variable): IBS signature over header

PAYLOAD (variable)
  AES-128-GCM encrypted data
    In-memory: single ciphertext + auth tag
    Streaming: 256 KiB segments, each with its own auth tag
```

## Yivi Integration

PostGuard uses [Yivi](https://yivi.app/) (formerly IRMA) for attribute-based identity verification. Identities are expressed as conjunctions of Yivi attributes:

```json
[
  {"t": "pbdf.sidn-pbdf.email.email", "v": "alice@example.com"},
  {"t": "pbdf.gemeente.personalData.fullname", "v": "Alice Example"}
]
```

Each attribute has a **type** (`t`, a fully-qualified Yivi attribute identifier) and an optional **value** (`v`). Omitting the value checks only that the attribute exists.

### Sender Flow (Signing Keys)

1. Client calls `POST /v2/irma/start` with the sender's signing policy.
2. PKG creates an IRMA disclosure request.
3. Sender scans the QR code with the Yivi app.
4. Client retrieves the session JWT via `GET /v2/irma/jwt/{token}`.
5. Client requests signing keys via `POST /v2/irma/sign/key` with the JWT.
6. PKG validates the JWT and issues signing keys.

### Recipient Flow (Decryption Keys)

1. Client reads the ciphertext header and identifies the recipient's hidden policy.
2. Client calls `POST /v2/irma/start` with the required attributes.
3. Recipient scans the QR code.
4. Client retrieves the JWT via `GET /v2/irma/jwt/{token}`.
5. Client requests the USK via `GET /v2/irma/key/{timestamp}`.
6. PKG validates the JWT, derives the KEM identity, and issues the USK.

### Hidden Policies

Ciphertext headers contain a hidden policy for each recipient. This shows attribute types but redacts values, so other recipients cannot see each other's identity details. Some attribute types may show partial hints (e.g., last 4 characters of a phone number) to help recipients identify which entry is theirs.

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
