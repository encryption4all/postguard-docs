# Getting Started

This guide walks you through installing the PostGuard SDK, encrypting a file, and decrypting it again.

## Prerequisites

- Node.js 18+ or a modern browser environment
- A PostGuard PKG server URL (e.g. `https://pkg.postguard.eu`)

## 1. Install

Install the SDK and its peer dependency for WebAssembly cryptography:

::: code-group

```sh [npm]
npm install @e4a/pg-js @e4a/pg-wasm
```

```sh [pnpm]
pnpm add @e4a/pg-js @e4a/pg-wasm
```

```sh [yarn]
yarn add @e4a/pg-js @e4a/pg-wasm
```

:::

If you plan to use Yivi-based authentication in the browser, also install the Yivi packages:

```sh
npm install @privacybydesign/yivi-core @privacybydesign/yivi-client @privacybydesign/yivi-web
```

## 2. Initialize PostGuard

Create a `PostGuard` instance with the PKG server URL. If you need file upload/download through Cryptify, pass `cryptifyUrl` as well.

```ts
import { PostGuard } from '@e4a/pg-js'

const pg = new PostGuard({
  pkgUrl: 'https://pkg.postguard.eu',
  cryptifyUrl: 'https://cryptify.postguard.eu', // optional
})
```

## 3. Encrypt a File

Choose an authentication method and specify recipients. This example uses an API key and encrypts files via Cryptify:

```ts
const result = await pg.encryptAndUpload({
  sign: pg.sign.apiKey('your-api-key'),
  recipients: [
    pg.recipient.email('alice@example.com'),
    pg.recipient.email('bob@example.com'),
  ],
  files: fileInput.files, // FileList from an <input type="file">
  onProgress: (pct) => console.log(`${pct}% uploaded`),
})

console.log('Encrypted file UUID:', result.uuid)
```

::: tip
`encryptAndUpload` requires `cryptifyUrl` to be set in the constructor. For raw byte encryption without Cryptify, use `pg.encrypt()` instead.
:::

### Encrypting raw data

If you want the encrypted bytes directly (e.g. for email integration), use `encrypt`:

```ts
const plaintext = new TextEncoder().encode('Hello, PostGuard!')

const ciphertext = await pg.encrypt({
  sign: pg.sign.apiKey('your-api-key'),
  recipients: [pg.recipient.email('alice@example.com')],
  data: plaintext,
})

// ciphertext is a Uint8Array
```

## 4. Decrypt a File

### From a Cryptify UUID (browser with Yivi)

```ts
const result = await pg.decrypt({
  uuid: 'abc123-def456-...',
  element: '#yivi-container', // DOM element for the Yivi QR code
})

console.log('Decrypted files:', result.files)
result.download('decrypted-files.zip')
```

### From raw encrypted data

```ts
const result = await pg.decrypt({
  data: ciphertext, // Uint8Array
  session: async (request) => {
    // Your custom Yivi session handler - return a JWT
    return await myYiviSessionHandler(request)
  },
  recipient: 'alice@example.com',
})

console.log('Plaintext:', new TextDecoder().decode(result.plaintext))
console.log('Sender:', result.sender)
```

## Next Steps

- [SDK Overview](/sdk/overview) -- architecture and constructor options
- [Encryption Methods](/sdk/encryption) -- all encryption options in depth
- [Decryption Methods](/sdk/decryption) -- UUID and raw data decryption
- [Authentication Methods](/sdk/auth-methods) -- API key, Yivi, and session callbacks
- [Error Handling](/sdk/errors) -- error classes and recovery patterns
