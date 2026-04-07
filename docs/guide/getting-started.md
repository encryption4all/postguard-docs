# Getting Started

This guide walks you through installing the PostGuard SDK, encrypting data, and decrypting it again. All code examples come from the [postguard-examples](https://github.com/encryption4all/postguard-examples) SvelteKit app and the [Thunderbird addon](https://github.com/encryption4all/postguard-tb-addon).

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

## 2. Initialize and Encrypt

Create a PostGuard instance and encrypt files for delivery. This module from the SvelteKit example initializes the client and wraps `encryptAndDeliver` with an API key:

<<< @/snippets/postguard-examples/pg-sveltekit/src/lib/postguard/encryption.ts{40-87 ts}

The configuration comes from environment variables:

<<< @/snippets/postguard-examples/pg-sveltekit/src/lib/config.ts

<<< @/snippets/postguard-examples/pg-sveltekit/.env.example

### Encrypting raw data for email

For email integration, the Thunderbird addon uses `pg.encrypt()` with raw MIME bytes instead of files. It builds the MIME, encrypts with a Yivi session callback, and wraps the result in an envelope:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{348-410 ts}

## 3. Decrypt

The SvelteKit example decrypts files from a Cryptify UUID using the Yivi QR widget:

<<< @/snippets/postguard-examples/pg-sveltekit/src/routes/download/+page.svelte{1-75}

### Decrypting raw data

The Thunderbird addon decrypts raw ciphertext using a session callback that opens a Yivi popup:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{713-738 ts}

## Bundler configuration

The SDK depends on `@e4a/pg-wasm`, which is a WebAssembly module. Most bundlers need plugins to handle WASM imports.

### Vite / SvelteKit

You need Vite plugins for WASM support and Node.js polyfills for browser environments. Here is a full working `vite.config.ts` from the [SvelteKit example](https://github.com/encryption4all/postguard-examples):

<<< @/snippets/postguard-examples/pg-sveltekit/vite.config.ts

### Browser extensions

Browser extensions often cannot use dynamic `import()` for WASM modules. The Thunderbird addon loads WASM indirectly and passes it to the constructor:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{78-106 ts}

## Next Steps

- [SDK Overview](/sdk/overview): architecture and constructor options
- [Encryption](/sdk/encryption): all encryption options in depth
- [Decryption](/sdk/decryption): UUID and raw data decryption
- [Authentication Methods](/sdk/auth-methods): API key, Yivi, and session callbacks
- [Web Application Integration](/integrations/web-app): full SvelteKit example
- [Email Addon Integration](/integrations/email-addon): Thunderbird and Outlook patterns
