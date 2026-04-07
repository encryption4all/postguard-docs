# Getting Started

This guide walks you through installing the PostGuard SDK, encrypting data, and decrypting it again.

## Prerequisites

- Node.js 18+ or a modern browser environment
- A PostGuard PKG server URL

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
  pkgUrl: 'https://pkg.example.com',
  cryptifyUrl: 'https://cryptify.example.com', // optional
})
```

## 3. Encrypt

Choose an authentication method and specify recipients. This example uses an API key and uploads files to Cryptify:

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

If you want the encrypted bytes directly (for email integration or custom storage), use `encrypt`:

```ts
const plaintext = new TextEncoder().encode('Hello, PostGuard!')

const ciphertext = await pg.encrypt({
  sign: pg.sign.apiKey('your-api-key'),
  recipients: [pg.recipient.email('alice@example.com')],
  data: plaintext,
})

// ciphertext is a Uint8Array
```

### Encrypting and delivering via email

If you want Cryptify to send notification emails to recipients with a download link:

```ts
const result = await pg.encryptAndDeliver({
  sign: pg.sign.apiKey('your-api-key'),
  recipients: [pg.recipient.email('alice@example.com')],
  files: [myFile],
  delivery: {
    message: 'Here are the documents you requested.',
    language: 'EN',
    confirmToSender: true,
  },
})
```

## 4. Decrypt

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
    // Your custom Yivi session handler, must return a JWT
    return await myYiviSessionHandler(request)
  },
  recipient: 'alice@example.com',
})

console.log('Plaintext:', new TextDecoder().decode(result.plaintext))
console.log('Sender:', result.sender)
```

## Bundler configuration

The SDK depends on `@e4a/pg-wasm`, which is a WebAssembly module. Most bundlers need plugins to handle WASM imports.

### Vite / SvelteKit

```sh
npm install -D vite-plugin-wasm vite-plugin-top-level-await
```

```ts
// vite.config.ts
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default {
  plugins: [wasm(), topLevelAwait()],
}
```

You may also need Node.js polyfills for browser environments if your code uses `buffer`, `stream`, or `process`:

```sh
npm install -D @esbuild-plugins/node-globals-polyfill
```

### Browser extensions

Browser extensions often cannot use dynamic `import()` for WASM modules. Pre-load the module and pass it to the constructor:

```ts
import * as pgWasm from '@e4a/pg-wasm'

const pg = new PostGuard({
  pkgUrl: 'https://pkg.example.com',
  wasm: pgWasm,
})
```

See the [Custom Integration](/integrations/custom) guide for more WASM loading strategies.

## Next Steps

- [SDK Overview](/sdk/overview): architecture and constructor options
- [Encryption](/sdk/encryption): all encryption options in depth
- [Decryption](/sdk/decryption): UUID and raw data decryption
- [Authentication Methods](/sdk/auth-methods): API key, Yivi, and session callbacks
- [Web Application Integration](/integrations/web-app): full SvelteKit example
- [Email Addon Integration](/integrations/email-addon): Thunderbird and Outlook patterns
