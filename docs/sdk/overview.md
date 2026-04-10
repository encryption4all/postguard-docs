# SDK Overview

The `@e4a/pg-js` package is the official JavaScript/TypeScript SDK for PostGuard identity-based encryption. It provides a high-level API for encrypting and decrypting data using identity attributes (such as email addresses) managed by a Private Key Generator (PKG).

## Architecture

The SDK has three layers:

```
+--------------------------------------------------+
|  PostGuard class                                  |
|  - encrypt() -> Sealed  (lazy builder)            |
|  - open()    -> Opened  (lazy builder)            |
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

Create a PostGuard instance with the PKG and Cryptify URLs:

```ts
import { PostGuard } from '@e4a/pg-js';

const pg = new PostGuard({
  pkgUrl: 'https://pkg.staging.yivi.app',
  cryptifyUrl: 'https://fileshare.staging.yivi.app'
});
```

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `pkgUrl` | `string` | Yes | URL of the PKG server |
| `cryptifyUrl` | `string` | No | URL of the Cryptify file storage service. Required for `sealed.upload()` and `pg.open({ uuid })`. |
| `headers` | `Record<string, string>` | No | Custom HTTP headers included in all requests to PKG and Cryptify |

## Encrypt and Decrypt

The SDK uses a lazy builder pattern. Calling `pg.encrypt()` or `pg.open()` returns a builder object that captures parameters but does no work. The actual operation runs when you call a terminal method on the builder.

```ts
// Encrypt: nothing happens until .upload() or .toBytes()
const sealed = pg.encrypt({ files, recipients, sign });
await sealed.upload();                                // encrypt + stream to Cryptify
await sealed.upload({ notify: { message: 'Hi' } });  // + email notification
const bytes = await sealed.toBytes();                 // encrypt + buffer in memory

// Decrypt: nothing happens until .inspect() or .decrypt()
const opened = pg.open({ uuid });
const info = await opened.inspect();                  // peek at recipients and sender
const result = await opened.decrypt({ element: '#yivi-web' });
result.download();
```

See [Encryption](/sdk/encryption) and [Decryption](/sdk/decryption) for full details.

## Builder Methods

The `PostGuard` instance exposes builder methods for constructing sign methods and recipients. These return plain configuration objects. No network calls happen until you pass them to `pg.encrypt()`.

### `pg.sign.*`

| Method | Returns | Use case |
|--------|---------|----------|
| `pg.sign.apiKey(key)` | `ApiKeySign` | Server-side or trusted environments |
| `pg.sign.yivi({ element, senderEmail?, attributes?, includeSender? })` | `YiviSign` | Browser apps with Yivi QR widget |
| `pg.sign.session(callback, { senderEmail })` | `SessionSign` | Extensions, custom Yivi flows |

See [Authentication Methods](/sdk/auth-methods) for details.

### `pg.recipient.*`

| Method | Returns | Use case |
|--------|---------|----------|
| `pg.recipient.email(email)` | `RecipientBuilder` | Encrypt for a specific email |
| `pg.recipient.emailDomain(email)` | `RecipientBuilder` | Encrypt for anyone at a domain |

Both return a `RecipientBuilder` that supports fluent chaining with `.extraAttribute(type, value)` to require additional attributes:

```ts
pg.recipient.email('alice@example.com')
  .extraAttribute('pbdf.gemeente.personalData.surname', 'Smith')
```

See [Encryption](/sdk/encryption) for recipient examples.

### `pg.email.*`

Email helper methods for building and parsing PostGuard-encrypted emails. See [Email Helpers](/sdk/email-helpers).
