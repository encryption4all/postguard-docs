# Getting Started

This guide walks you through installing the PostGuard SDK, encrypting data, and decrypting it again. All code examples come from the [postguard-examples](https://github.com/encryption4all/postguard-examples) SvelteKit app and the [Thunderbird addon](https://github.com/encryption4all/postguard-tb-addon).

## Prerequisites

- Node.js 18+ or a modern browser environment
- A PostGuard PKG server URL

## 1. Install

Install the SDK:

::: code-group

```sh [npm]
npm install @e4a/pg-js
```

```sh [pnpm]
pnpm add @e4a/pg-js
```

```sh [yarn]
yarn add @e4a/pg-js
```

:::

The SDK bundles or manages all its dependencies internally. You do not need to install `@e4a/pg-wasm`, Yivi packages, or any other PostGuard package separately.

## 2. Initialize and Encrypt

Create a PostGuard instance and encrypt files for delivery. This module from the SvelteKit example initializes the client and uses the new `Sealed` builder:

```ts
import { PostGuard } from '@e4a/postguard-js';
import type { CitizenRecipient, OrganisationRecipient } from '$lib/types';
import { PKG_URL, CRYPTIFY_URL } from '$lib/config';

const pg = new PostGuard({ pkgUrl: PKG_URL, cryptifyUrl: CRYPTIFY_URL });

export async function encryptAndSend(options: EncryptAndSendOptions): Promise<string> {
  const { files, citizen, organisation, apiKey, message, onProgress, abortController } = options;

  const sealed = pg.encrypt({
    files,
    recipients: [
      pg.recipient.email(citizen.email),
      pg.recipient.emailDomain(organisation.email)
    ],
    sign: pg.sign.apiKey(apiKey),
    onProgress,
    signal: abortController?.signal
  });

  const result = await sealed.upload({
    notify: {
      message: message ?? undefined,
      language: 'EN',
      confirmToSender: false
    }
  });

  return result.uuid;
}
```

<small>[Source: encryption.ts#L1-L46](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/lib/postguard/encryption.ts#L1-L46)</small>

The configuration comes from environment variables:

```sh
# Public (available in browser)
PUBLIC_PKG_URL=https://pkg.staging.yivi.app
PUBLIC_CRYPTIFY_URL=https://fileshare.staging.yivi.app
PUBLIC_APP_NAME=PostGuard for Business Example

# Server-only
PG_API_KEY=PG-API-your-key-here
```

<small>[Source: .env.example](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/.env.example)</small>

### Encrypting raw data for email

For email integration, the Thunderbird addon uses `pg.encrypt()` with raw MIME bytes instead of files. It builds the MIME, encrypts with a Yivi session callback, and wraps the result in an envelope:

```ts
// Build inner MIME (subject, body, attachments all in one)
const mimeData = pg!.email.buildMime({
  from: details.from,
  to: [...details.to],
  subject: originalSubject,
  htmlBody: details.body,
  attachments: attachmentData,
});

// Encrypt and wrap in email envelope
const envelope = await pg!.email.createEnvelope({
  sealed: pg!.encrypt({
    data: mimeData,
    recipients: pgRecipients,
    sign: pg!.sign.session(callback, { senderEmail: from }),
  }),
  from: details.from,
});
```

<small>[Source: background.ts#L331-L390](https://github.com/encryption4all/postguard-tb-addon/blob/feat/implement-sdk/src/background/background.ts#L331-L390)</small>

## 3. Decrypt

The SvelteKit example decrypts files from a Cryptify UUID using the Yivi QR widget:

```ts
import { PostGuard, IdentityMismatchError } from '@e4a/postguard-js';
import type { DecryptFileResult } from '@e4a/postguard-js';

const pg = new PostGuard({ pkgUrl: PKG_URL, cryptifyUrl: CRYPTIFY_URL });

async function startDecrypt() {
  try {
    const opened = pg.open({ uuid });
    const decrypted = await opened.decrypt({
      element: '#yivi-web',
      recipient: recipientParam || undefined
    });

    const result = decrypted as DecryptFileResult;
    senderEmail = result.sender?.email ?? '';

    // Auto-download
    result.download();
  } catch (e) {
    if (e instanceof IdentityMismatchError) {
      dlState = 'identity-mismatch';
    } else {
      errorMessage = e instanceof Error ? e.message : String(e);
      dlState = 'error';
    }
  }
}
```

<small>[Source: +page.svelte#L4-L63](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/routes/download/+page.svelte#L4-L63)</small>

## Bundler configuration

The SDK depends on `@e4a/pg-wasm`, which is a WebAssembly module. Most bundlers need plugins to handle WASM imports.

### Vite / SvelteKit

You need Vite plugins for WASM support and top-level await:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [sveltekit(), wasm(), topLevelAwait()]
});
```

<small>[Source: vite.config.ts](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/vite.config.ts)</small>

No Node.js polyfills are needed. The SDK handles all browser compatibility internally.

### Browser extensions

Browser extensions often cannot use dynamic `import()` for WASM modules. The Thunderbird addon loads WASM indirectly and passes it to the constructor:

```ts
const pgWasmPath = "./pg-wasm/load.js";
const modPromise = import(/* @vite-ignore */ pgWasmPath).then((mod: any) => {
  console.log("[PostGuard] pg-wasm loaded");
  return mod as WasmModule;
});

// Later, pass it to PostGuard:
pg = new PostGuard({
  pkgUrl: PKG_URL,
  headers: getClientHeader(),
  wasm: await modPromise,
});
```

<small>[Source: background.ts#L66-L73](https://github.com/encryption4all/postguard-tb-addon/blob/feat/implement-sdk/src/background/background.ts#L66-L73)</small>

## Next Steps

- [SDK Overview](/sdk/overview): architecture and constructor options
- [Encryption](/sdk/encryption): all encryption options in depth
- [Decryption](/sdk/decryption): UUID and raw data decryption
- [Authentication Methods](/sdk/auth-methods): API key, Yivi, and session callbacks
- [Web Application Integration](/integrations/web-app): full SvelteKit example
- [Email Addon Integration](/integrations/email-addon): Thunderbird and Outlook patterns
