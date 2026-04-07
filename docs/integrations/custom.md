# Custom Integration

This guide covers advanced scenarios: environments without Yivi web, custom attribute policies, pre-loaded WASM, low-level utilities, and the command-line tool.

## Environments Without Yivi Web

If your environment cannot render the Yivi QR code (server-side, CLI, mobile webview), you have two options.

### Option 1: API Key

The simplest approach for trusted environments:

```ts
const pg = new PostGuard({ pkgUrl: 'https://pkg.example.com' })

const ciphertext = await pg.encrypt({
  sign: pg.sign.apiKey('PG-API-your-key-here'),
  recipients: [pg.recipient.email('alice@example.com')],
  data: plaintext,
})
```

### Option 2: Session Callback with External Yivi

Run the Yivi session in a separate process or service and bridge it via the session callback:

```ts
const sign = pg.sign.session(
  async (request) => {
    // Forward the session request to your Yivi service
    const response = await fetch('https://your-yivi-service.com/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    const { jwt } = await response.json()
    return jwt
  },
  { senderEmail: 'sender@example.com' }
)
```

The same pattern works for decryption:

```ts
const result = await pg.decrypt({
  data: ciphertext,
  session: async (request) => {
    // request.sort === 'Decryption'
    // request.con -- attributes the recipient must prove
    // request.hints -- suggested values to display
    const jwt = await runExternalYiviSession(request)
    return jwt
  },
  recipient: 'alice@example.com',
})
```

## Custom Attribute Policies

By default, `pg.recipient.email()` creates a policy that requires the recipient to prove ownership of their email address (`pbdf.sidn-pbdf.email.email`). For more advanced access control, use `pg.recipient.withPolicy()`.

### Multiple attributes

Require the recipient to prove both email and name:

```ts
const recipient = pg.recipient.withPolicy('alice@example.com', [
  { t: 'pbdf.sidn-pbdf.email.email', v: 'alice@example.com' },
  { t: 'pbdf.gemeente.personalData.fullname', v: 'Alice Smith' },
])
```

### Organisation-level access

Allow anyone from a domain to decrypt:

```ts
const recipient = pg.recipient.emailDomain('info@company.nl')
// Uses pbdf.sidn-pbdf.email.domain with the domain extracted from the email
```

### Mixed policies

Combine different recipient types in a single encryption:

```ts
await pg.encrypt({
  sign: pg.sign.apiKey('PG-API-key'),
  recipients: [
    pg.recipient.email('alice@example.com'),
    pg.recipient.emailDomain('info@company.nl'),
    pg.recipient.withPolicy('bob@example.com', [
      { t: 'pbdf.sidn-pbdf.email.email', v: 'bob@example.com' },
      { t: 'pbdf.gemeente.personalData.bsn', v: '123456789' },
    ]),
  ],
  data: plaintext,
})
```

### Common attribute types

| Attribute type | Description |
|----------------|-------------|
| `pbdf.sidn-pbdf.email.email` | Email address |
| `pbdf.sidn-pbdf.email.domain` | Email domain |
| `pbdf.gemeente.personalData.fullname` | Full name (from municipality) |
| `pbdf.gemeente.personalData.bsn` | BSN (citizen service number) |
| `pbdf.gemeente.personalData.dateofbirth` | Date of birth |
| `pbdf.sidn-pbdf.mobilenumber.mobilenumber` | Mobile phone number |

## Pre-loaded WASM

The SDK dynamically imports `@e4a/pg-wasm` when needed. In environments where this does not work, pre-load the module.

### Standard pre-load

```ts
import * as pgWasm from '@e4a/pg-wasm'

const pg = new PostGuard({
  pkgUrl: 'https://pkg.example.com',
  wasm: pgWasm,
})
```

### Extension-compatible loading

In browser extensions, you may need an indirect import to prevent the bundler from resolving it:

```ts
const wasmPath = './pg-wasm/load.js'
const pgWasm = await import(/* @vite-ignore */ wasmPath)

const pg = new PostGuard({
  pkgUrl: 'https://pkg.example.com',
  wasm: pgWasm,
})
```

### Custom WASM wrapper

If you need to customize WASM loading (e.g. loading from a CDN or specific path), create a wrapper that matches the `WasmModule` interface:

```ts
import type { WasmModule } from '@e4a/pg-js'

const customWasm: WasmModule = {
  sealStream: async (...args) => {
    const mod = await loadWasmFromCustomSource()
    return mod.sealStream(...args)
  },
  StreamUnsealer: {
    new: async (...args) => {
      const mod = await loadWasmFromCustomSource()
      return mod.StreamUnsealer.new(...args)
    },
  },
}

const pg = new PostGuard({
  pkgUrl: 'https://pkg.example.com',
  wasm: customWasm,
})
```

## PKG Utilities

The SDK exports low-level PKG functions for custom startup flows, caching, and health checks.

### Fetching the master public key

```ts
import { fetchMPK } from '@e4a/pg-js'

const mpk = await fetchMPK('https://pkg.example.com', {
  'X-Custom-Header': 'value',
})
```

### Fetching the verification key

```ts
import { fetchVerificationKey } from '@e4a/pg-js'

const vk = await fetchVerificationKey('https://pkg.example.com')
```

### Caching pattern for extensions

Browser extensions can cache keys in `browser.storage.local` for offline resilience:

```ts
import { fetchMPK } from '@e4a/pg-js'

async function getCachedMPK(pkgUrl: string): Promise<string> {
  const stored = await browser.storage.local.get('pg-mpk')
  try {
    const mpk = await fetchMPK(pkgUrl)
    if (stored['pg-mpk'] !== mpk) {
      await browser.storage.local.set({ 'pg-mpk': mpk })
    }
    return mpk
  } catch {
    if (stored['pg-mpk']) return stored['pg-mpk']
    throw new Error('No master public key available')
  }
}
```

## Policy Utilities

For advanced use cases, the SDK exports policy utilities:

```ts
import {
  buildKeyRequest,
  sortPolicies,
  secondsTill4AM,
} from '@e4a/pg-js'

// Build a key request for decryption (used internally by the SDK)
const keyRequest = buildKeyRequest(recipientEmail, policy)

// Sort attribute constraints alphabetically by type
const sorted = sortPolicies(constraints)

// Seconds until 4 AM (key expiry time)
const ttl = secondsTill4AM()
```

### `buildKeyRequest()`

Creates a key request object from a recipient email and policy. It sets the email attribute value to the recipient key, infers the domain for domain attributes, and strips values from unknown attributes. The result includes the validity period (seconds until 4 AM).

### `sortPolicies()`

Sorts an array of attribute constraints alphabetically by type. This ensures deterministic policy ordering, which is important for identity derivation (the hash is sensitive to ordering).

### `secondsTill4AM()`

Returns the number of seconds until the next 4:00 AM. This is the default key validity period used by the PKG.

## Yivi Session Runner

The SDK exports `runYiviSession()` for running a complete Yivi session flow. This is useful in popup windows or custom Yivi UIs:

```ts
import { runYiviSession } from '@e4a/pg-js'

const jwt = await runYiviSession({
  pkgUrl: 'https://pkg.example.com',
  element: '#yivi-qr',
  constraints: [
    { t: 'pbdf.sidn-pbdf.email.email', v: 'user@example.com' },
  ],
  sort: 'Signing', // or 'Decryption'
})
```

This function handles starting the session with the PKG, rendering the QR code, polling for completion, and returning the JWT.

## Node.js / Server-Side

The SDK works in Node.js with some considerations:

1. WASM: you need a Node.js-compatible build of `@e4a/pg-wasm`, or pre-load it via the `wasm` option.
2. Streams: the SDK uses web `ReadableStream`/`WritableStream`. Node.js 18+ supports these natively.
3. Authentication: use `pg.sign.apiKey()` since Yivi web rendering is not available.

```ts
import { PostGuard } from '@e4a/pg-js'

const pg = new PostGuard({
  pkgUrl: process.env.PKG_URL!,
})

// Encrypt
const encrypted = await pg.encrypt({
  sign: pg.sign.apiKey(process.env.PG_API_KEY!),
  recipients: [pg.recipient.email('alice@example.com')],
  data: Buffer.from('Hello from Node.js'),
})

// Decrypt (requires a session callback since there is no DOM)
const result = await pg.decrypt({
  data: encrypted,
  session: async (request) => {
    return await serverSideYiviSession(request)
  },
  recipient: 'alice@example.com',
})
```

## CLI Tool (pg-cli)

The `pg-cli` tool provides command-line encryption and decryption. It is part of the [PostGuard core repository](https://github.com/encryption4all) and is written in Rust.

### Encrypt a file

```sh
pg-cli enc input.pdf \
  --identity '{"alice@example.com": [{"t": "pbdf.sidn-pbdf.email.email", "v": "alice@example.com"}]}' \
  --pub-sign-id '[{"t": "pbdf.sidn-pbdf.email.email"}]' \
  --api-key 'PG-API-your-key-here'
```

This produces `input.pdf.enc`.

### Decrypt a file

```sh
pg-cli dec input.pdf.enc
```

The CLI prompts you to select a recipient ID, then opens a Yivi session for identity verification. After approval, it decrypts the file.

### Options

| Flag | Description |
|------|-------------|
| `--identity` | JSON map of recipient IDs to attribute constraints |
| `--pub-sign-id` | JSON array of public signing attribute types |
| `--priv-sign-id` | JSON array of private signing attribute types (optional) |
| `--api-key` | API key for authentication (alternative to Yivi) |
| `--pkg` | PKG server URL (default: `https://stable.irmaseal-pkg.ihub.ru.nl`) |

## Custom HTTP Headers

Pass custom headers for all SDK requests via the constructor:

```ts
const pg = new PostGuard({
  pkgUrl: 'https://pkg.example.com',
  headers: {
    'X-PostGuard-Client-Version': 'MyApp/2.0',
    'X-Request-ID': crypto.randomUUID(),
  },
})
```

These headers are included in every request to both the PKG and Cryptify backends.

## Running a PKG Server

The `pg-pkg` binary runs the PKG server. It has two subcommands:

### Generate master keys

```sh
pg-pkg gen
```

This creates four key files in the current directory: `pkg_ibe.pub`, `pkg_ibe.sec`, `pkg_ibs.pub`, `pkg_ibs.sec`.

### Start the server

```sh
pg-pkg server \
  --host 0.0.0.0 \
  --port 8087 \
  --ibe-pub-key pkg_ibe.pub \
  --ibe-sec-key pkg_ibe.sec \
  --ibs-pub-key pkg_ibs.pub \
  --ibs-sec-key pkg_ibs.sec
```

The server can optionally connect to PostgreSQL for persistence (API key management and audit logging) via a `DATABASE_URL` environment variable.
