# SDK Overview

PostGuard provides two official SDKs for identity-based encryption:

- **@e4a/pg-js** — JavaScript/TypeScript SDK for browsers and Node.js
- **E4A.PostGuard** — .NET SDK for server-side applications

Both SDKs use the same lazy builder pattern: calling `encrypt()` returns a builder that captures parameters but does no work until you call a terminal method like `upload()` or `toBytes()`.

## Feature Comparison

| Feature | JS (`@e4a/pg-js`) | .NET (`E4A.PostGuard`) |
|---|:---:|:---:|
| **Encryption** | | |
| File encryption (zipped) | Yes | Yes |
| Raw data encryption | Yes | Yes |
| Streaming encryption | Yes | No |
| **Decryption** | | |
| Decrypt from Cryptify UUID | Yes | No |
| Decrypt from raw data | Yes | No |
| Inspect metadata before decrypt | Yes | No |
| Streaming decryption | Yes | No |
| **Upload** | | |
| Upload to Cryptify | Yes | Yes |
| Email notification on upload | Yes | Yes |
| Upload progress callback | Yes | No |
| **Signing** | | |
| API key signing | Yes | Yes |
| Yivi web (QR code) | Yes | No |
| Custom session callback | Yes | No |
| **Recipients** | | |
| Email address | Yes | Yes |
| Email domain | Yes | Yes |
| Extra attributes | Yes | Yes |
| **Email helpers** | | |
| Build MIME message | Yes | No |
| Extract ciphertext from email | Yes | No |
| Create email envelope | Yes | No |
| Inject MIME headers | Yes | No |
| **Other** | | |
| Abort / cancellation support | Yes (`AbortSignal`) | Yes (`CancellationToken`) |
| JWT caching (decryption) | Yes | N/A |
| Custom HTTP headers | Yes | Yes |

The .NET SDK is sending-side only: it handles encryption and upload. Decryption is handled by the receiving side via the PostGuard website or the email plugins.

## Architecture

Both SDKs follow the same three-layer architecture:

```
+--------------------------------------------------+
|  SDK (PostGuard class)                            |
|  - encrypt() -> Sealed  (lazy builder)            |
|  - open()    -> Opened  (JS only)                 |
|  - sign / recipient / email builders              |
+--------------------------------------------------+
|  Crypto layer                                     |
|  JS:   @e4a/pg-wasm (WebAssembly)                 |
|  .NET: libpg_ffi (native P/Invoke)                |
|  - IBE (CGWKV) + IBS (GG) + AES-128-GCM          |
+--------------------------------------------------+
|  Backend services                                 |
|  - PKG: key issuance, Yivi session management     |
|  - Cryptify: encrypted file storage + delivery    |
+--------------------------------------------------+
```

The PKG (Private Key Generator) is the identity-based encryption server. It issues user secret keys after verifying identity attributes through Yivi, and provides the master public key for encryption.

Cryptify is an optional file storage and email delivery service. It stores encrypted files and can send notification emails to recipients.
