# Web Application Integration

This guide shows how to integrate PostGuard encryption and decryption into a web application. The examples come from the [postguard-examples](https://github.com/encryption4all/postguard-examples) repository and use SvelteKit, but the patterns apply to any frontend framework.

## Setup

Install the SDK, WASM module, and Yivi packages:

```sh
npm install @e4a/pg-js @e4a/pg-wasm
npm install @privacybydesign/yivi-core @privacybydesign/yivi-client @privacybydesign/yivi-web
```

You also need Vite plugins for WASM support and Node.js polyfills for browser environments:

<<< @/snippets/postguard-examples/pg-sveltekit/vite.config.ts

Configure the PKG and Cryptify URLs via environment variables:

<<< @/snippets/postguard-examples/pg-sveltekit/.env.example

Keep the API key server-side only:

<<< @/snippets/postguard-examples/pg-sveltekit/src/lib/config.server.ts

The public config provides the PKG and Cryptify URLs to the browser:

<<< @/snippets/postguard-examples/pg-sveltekit/src/lib/config.ts

## Encrypt and Upload Files

Create a module that initializes PostGuard and wraps the `encryptAndDeliver` call:

<<< @/snippets/postguard-examples/pg-sveltekit/src/lib/postguard/encryption.ts{1-87 ts}

Then build a page that calls this function. This example uses API key authentication (PostGuard for Business):

<<< @/snippets/postguard-examples/pg-sveltekit/src/routes/send/+page.svelte{1-65}

The server load function passes the API key to the page:

<<< @/snippets/postguard-examples/pg-sveltekit/src/routes/send/+page.server.ts

## Decrypt Files

A page that decrypts files from a Cryptify UUID. The UUID and recipient can come from URL query parameters (as provided in Cryptify notification emails):

<<< @/snippets/postguard-examples/pg-sveltekit/src/routes/download/+page.svelte{1-75}

## Yivi QR Styling

The Yivi QR container needs some CSS to render properly. Import the Yivi CSS or add minimal styles:

```css
#yivi-qr, #yivi-web {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```
