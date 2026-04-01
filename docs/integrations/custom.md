# Custom Integration

This guide covers advanced scenarios: environments without Yivi web, custom attribute policies, pre-loaded WASM, and low-level utilities.

## Environments Without Yivi Web

If your environment cannot render the Yivi QR code (server-side, CLI, mobile webview), you have two options:

### Option 1: API Key

The simplest approach for trusted environments:

```ts
const pg = new PostGuard({ pkgUrl: 'https://pkg.postguard.eu' })

const ciphertext = await pg.encrypt({
  sign: pg.sign.apiKey('your-api-key'),
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

    // The service runs the Yivi session and returns a JWT
    const { jwt } = await response.json()
    return jwt
  },
  { senderEmail: 'sender@example.com' }
)
```

### Session callback for decryption

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

By default, `pg.recipient.email()` creates a policy that requires the recipient to prove ownership of their email address. For more advanced access control, use `pg.recipient.withPolicy()`.

### Multiple attributes

Require the recipient to prove both email and name:

```ts
const recipient = pg.recipient.withPolicy('alice@example.com', [
  { t: 'pbdf.sidn-pbdf.email.email', v: 'alice@example.com' },
  { t: 'pbdf.gemeente.personalData.fullname', v: 'Alice Smith' },
])
```

### Organisation-level access

Allow anyone from a domain to decrypt using `emailDomain`:

```ts
const recipient = pg.recipient.emailDomain('info@company.nl')
```

### Mixed policies

You can combine different recipient types in a single encryption:

```ts
await pg.encrypt({
  sign: pg.sign.apiKey('key'),
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
| `pbdf.gemeente.personalData.fullname` | Full name (from municipality) |
| `pbdf.gemeente.personalData.bsn` | BSN (citizen service number) |
| `pbdf.pbdf.email.domain` | Email domain |

## Pre-loaded WASM

The SDK dynamically imports `@e4a/pg-wasm` when needed. In environments where this does not work, pre-load the module.

### Standard pre-load

```ts
import * as pgWasm from '@e4a/pg-wasm'

const pg = new PostGuard({
  pkgUrl: 'https://pkg.postguard.eu',
  wasm: pgWasm,
})
```

### Extension-compatible loading

In browser extensions, you may need an indirect import to prevent the bundler from resolving it:

```ts
const wasmPath = './pg-wasm/load.js'
const pgWasm = await import(/* @vite-ignore */ wasmPath)

const pg = new PostGuard({
  pkgUrl: 'https://pkg.postguard.eu',
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
  pkgUrl: 'https://pkg.postguard.eu',
  wasm: customWasm,
})
```

## PKG Utilities

The SDK exports low-level PKG functions for custom startup flows, caching, and health checks:

### Fetching the master public key

```ts
import { fetchMPK } from '@e4a/pg-js'

// Fetch and cache the master public key
const mpk = await fetchMPK('https://pkg.postguard.eu', {
  'X-Custom-Header': 'value',
})

// Store in your own cache
localStorage.setItem('pg-mpk', mpk)
```

### Fetching the verification key

```ts
import { fetchVerificationKey } from '@e4a/pg-js'

const vk = await fetchVerificationKey('https://pkg.postguard.eu')
```

### Caching pattern for extensions

Browser extensions can cache keys in `browser.storage.local` for offline resilience:

```ts
import { fetchMPK, fetchVerificationKey } from '@e4a/pg-js'

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
  buildEncryptionPolicy,
} from '@e4a/pg-js'

// Build an encryption policy for recipients
const policy = buildEncryptionPolicy(recipients)

// Build a key request for decryption
const keyRequest = buildKeyRequest(recipientEmail, policy)

// Sort policies by timestamp
const sorted = sortPolicies(policies)

// Seconds until 4 AM (policy expiry time)
const ttl = secondsTill4AM()
```

## Node.js / Server-Side

The SDK can work in Node.js with some considerations:

1. **WASM**: You need a Node.js-compatible build of `@e4a/pg-wasm`, or pre-load it via the `wasm` option.
2. **Streams**: The SDK uses web `ReadableStream` / `WritableStream`. Node.js 18+ supports these natively.
3. **Authentication**: Use `pg.sign.apiKey()` since Yivi web rendering is not available.

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
    // Implement server-side Yivi session flow
    return await serverSideYiviSession(request)
  },
  recipient: 'alice@example.com',
})
```

## Custom HTTP Headers

Pass custom headers for all SDK requests via the constructor:

```ts
const pg = new PostGuard({
  pkgUrl: 'https://pkg.postguard.eu',
  headers: {
    'X-PostGuard-Client-Version': 'MyApp/2.0',
    'X-Request-ID': crypto.randomUUID(),
    'Authorization': 'Bearer custom-token',
  },
})
```

These headers are included in every request to both the PKG and Cryptify backends.
