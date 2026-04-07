# SDK Overview

The `@e4a/pg-js` package is the official JavaScript/TypeScript SDK for PostGuard identity-based encryption. It provides a high-level API for encrypting and decrypting data using identity attributes (such as email addresses) managed by a Private Key Generator (PKG).

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
|  - sealStream / StreamUnsealer                    |
|  - IBE primitives (CGWKV) + IBS (GG)             |
|  - AES-128-GCM symmetric encryption              |
+--------------------------------------------------+
|  Backend services                                 |
|  - PKG: key generation, Yivi session management   |
|  - Cryptify: encrypted file storage + delivery    |
+--------------------------------------------------+
```

PKG (Private Key Generator) is the identity-based encryption server. It issues user secret keys after verifying identity attributes through Yivi, and provides the master public key for encryption.

Cryptify is an optional file storage and email delivery service. It stores encrypted files and can send notification emails to recipients.

## Constructor

The SvelteKit example initializes PostGuard with a PKG URL and Cryptify URL from environment variables:

```ts
import type { ISealOptions } from '@e4a/pg-wasm';
import type { CitizenRecipient, OrganisationRecipient } from '$lib/types';
import { PKG_URL, UPLOAD_CHUNK_SIZE } from '$lib/config';
import Chunker, { withTransform } from './chunker';
import { createFileReadable, getFileStoreStream } from './file-provider';
```

<small>[Source: encryption.ts#L1-L5](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/lib/postguard/encryption.ts#L1-L5)</small>

The Thunderbird addon passes additional options for custom headers and a pre-loaded WASM module:

```ts
    // Clean up compose tab state
    composeTabs.delete(tab.id);
  }
});

browser.windows.onCreated.addListener(async (window) => {
  if (window.type === "messageCompose") {
    const tabs = await browser.tabs.query({ windowId: window.id });
```

<small>[Source: background.ts#L199-L206](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L199-L206)</small>

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `pkgUrl` | `string` | Yes | URL of the PKG server |
| `cryptifyUrl` | `string` | No | URL of the Cryptify file storage service. Required for `encryptAndUpload`, `encryptAndDeliver`, and `decrypt({ uuid })`. |
| `headers` | `Record<string, string>` | No | Custom HTTP headers included in all requests to PKG and Cryptify |
| `wasm` | `WasmModule` | No | Pre-loaded `@e4a/pg-wasm` module. By default the SDK dynamically imports it. |

## Builder Methods

The `PostGuard` instance exposes builder methods for constructing sign methods and recipients. These return plain configuration objects. No network calls happen until you pass them to an encrypt or decrypt method.

### `pg.sign.*`

| Method | Returns | Use case |
|--------|---------|----------|
| `pg.sign.apiKey(key)` | `ApiKeySign` | Server-side or trusted environments |
| `pg.sign.yivi({ element, senderEmail })` | `YiviSign` | Browser apps with Yivi QR widget |
| `pg.sign.session(callback, { senderEmail })` | `SessionSign` | Extensions, custom Yivi flows |

See [Authentication Methods](/sdk/auth-methods) for details and real usage from the Thunderbird addon.

### `pg.recipient.*`

| Method | Returns | Use case |
|--------|---------|----------|
| `pg.recipient.email(email)` | `EmailRecipient` | Encrypt for a specific email |
| `pg.recipient.emailDomain(email)` | `EmailDomainRecipient` | Encrypt for anyone at a domain |
| `pg.recipient.withPolicy(email, policy)` | `CustomPolicyRecipient` | Encrypt with custom attribute requirements |

See [Encryption](/sdk/encryption) for recipient examples from real code.

### `pg.email.*`

Email helper methods for building and parsing PostGuard-encrypted emails. See [Email Helpers](/sdk/email-helpers).
