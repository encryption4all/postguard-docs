# SDK Overview

The `@e4a/pg-js` package is the official JavaScript/TypeScript SDK for PostGuard identity-based encryption. It provides a high-level API for encrypting and decrypting data using identity-based attributes (such as email addresses) managed by a Private Key Generator (PKG).

## Architecture

The SDK has three layers:

```
+--------------------------------------------------+
|  PostGuard class                                  |
|  - encrypt / encryptAndUpload / encryptAndDeliver |
|  - decrypt (UUID or raw data)                     |
|  - sign.*   (auth method builders)                |
|  - recipient.*  (recipient builders)              |
|  - email.*  (MIME helpers)                        |
+--------------------------------------------------+
|  Crypto layer  (@e4a/pg-wasm)                     |
|  - Stream sealing / unsealing                     |
|  - Identity-based encryption primitives           |
+--------------------------------------------------+
|  Backend services                                 |
|  - PKG: key generation, Yivi session management   |
|  - Cryptify: encrypted file storage + delivery    |
+--------------------------------------------------+
```

**PKG (Private Key Generator)** is the identity-based encryption server. It issues user secret keys after verifying identity attributes through Yivi, and provides master public keys for encryption.

**Cryptify** is an optional file storage and email delivery service. It stores encrypted files and can send notification emails to recipients.

## Constructor Options

```ts
import { PostGuard } from '@e4a/pg-js'

const pg = new PostGuard({
  pkgUrl: 'https://pkg.postguard.eu',
  cryptifyUrl: 'https://cryptify.postguard.eu',
  headers: { 'X-Custom-Header': 'value' },
  wasm: preloadedWasmModule,
})
```

### `pkgUrl` (required)

The URL of the PKG server. All encryption and decryption operations communicate with this server to obtain public parameters and user secret keys.

### `cryptifyUrl` (optional)

The URL of the Cryptify file storage service. Required for:
- `encryptAndUpload()` -- encrypt and store files
- `encryptAndDeliver()` -- encrypt, store, and email
- `decrypt({ uuid })` -- decrypt files by UUID

Not needed for `encrypt()` and `decrypt({ data })` which work with raw bytes.

### `headers` (optional)

Custom HTTP headers included in all requests to the PKG and Cryptify backends. Useful for:
- Client version identification
- Authorization tokens
- Custom tracking headers

```ts
const pg = new PostGuard({
  pkgUrl: 'https://pkg.postguard.eu',
  headers: {
    'X-PostGuard-Client-Version': 'MyApp/1.0',
  },
})
```

### `wasm` (optional)

A pre-loaded `@e4a/pg-wasm` module. By default, the SDK dynamically imports `@e4a/pg-wasm` when needed. In environments where dynamic imports do not work (browser extensions, certain bundler configurations), you can pre-load the WASM module and pass it in:

```ts
import * as pgWasm from '@e4a/pg-wasm'

const pg = new PostGuard({
  pkgUrl: 'https://pkg.postguard.eu',
  wasm: pgWasm,
})
```

See the [Custom Integrations](/integrations/custom) guide for more details on WASM loading strategies.

## Builder Methods

The `PostGuard` instance exposes builder methods for constructing sign methods and recipients. These return plain configuration objects -- no network calls are made until you pass them to an encrypt or decrypt method.

### `pg.sign.*`

| Method | Returns | Use case |
|--------|---------|----------|
| `pg.sign.apiKey(key)` | `ApiKeySign` | Server-side or trusted environments |
| `pg.sign.yivi({ element, senderEmail })` | `YiviSign` | Browser apps with Yivi QR widget |
| `pg.sign.session(callback, { senderEmail })` | `SessionSign` | Extensions, custom Yivi flows |

See [Authentication Methods](/sdk/auth-methods) for details.

### `pg.recipient.*`

| Method | Returns | Use case |
|--------|---------|----------|
| `pg.recipient.email(email)` | `EmailRecipient` | Encrypt for a specific email |
| `pg.recipient.emailDomain(email)` | `EmailDomainRecipient` | Encrypt for an email domain (organisation) |
| `pg.recipient.withPolicy(email, policy)` | `CustomPolicyRecipient` | Encrypt with custom attribute requirements |

See [Encryption](/sdk/encryption) for recipient examples.

### `pg.email.*`

Email helper methods for building and parsing PostGuard-encrypted emails. See [Email Helpers](/sdk/email-helpers).

## Exported Utilities

Besides the `PostGuard` class, the package exports several standalone utilities:

```ts
import {
  // Error classes
  PostGuardError,
  NetworkError,
  YiviNotInstalledError,
  DecryptionError,
  IdentityMismatchError,

  // PKG API functions (for custom startup, caching)
  fetchMPK,
  fetchVerificationKey,

  // Policy utilities
  buildKeyRequest,
  sortPolicies,
  secondsTill4AM,
  buildEncryptionPolicy,

  // Email helpers (also available via pg.email.*)
  buildMime,
  injectMimeHeaders,
  createEnvelope,
  extractCiphertext,
  extractArmoredPayload,
  armorBase64,
} from '@e4a/pg-js'
```
