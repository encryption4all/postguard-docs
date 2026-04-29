# pg-sveltekit

[GitHub](https://github.com/encryption4all/postguard-examples/tree/main/pg-sveltekit) · TypeScript · SvelteKit Example

A SvelteKit application demonstrating PostGuard file encryption and decryption in a web browser using `@e4a/pg-js`. Part of the [postguard-examples](https://github.com/encryption4all/postguard-examples) repository.

## Running

```bash
cd pg-sveltekit
npm install
npm run dev
```

## Setup

You need two Vite plugins for WASM support:

```sh
npm install -D vite-plugin-wasm vite-plugin-top-level-await
```

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

No Node.js polyfills are needed. The SDK handles browser compatibility internally.

Configure the PKG and Cryptify URLs via environment variables. Keep the API key server-side only:

```sh
# Public (available in browser)
PUBLIC_PKG_URL=https://pkg.staging.yivi.app
PUBLIC_CRYPTIFY_URL=https://fileshare.staging.yivi.app
PUBLIC_APP_NAME=PostGuard for Business Example

# Server-only
PG_API_KEY=PG-your-key-here
```

<small>[Source: .env.example](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/.env.example)</small>

```ts
import { env } from '$env/dynamic/private';

export const PG_API_KEY = env['PG_API_KEY'] ?? '';
```

<small>[Source: config.server.ts](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/lib/config.server.ts)</small>

```ts
import { env } from '$env/dynamic/public';

export const APP_NAME = env.PUBLIC_APP_NAME || 'PostGuard for Business Example';
export const PKG_URL = env.PUBLIC_PKG_URL || 'https://pkg.staging.yivi.app';
export const CRYPTIFY_URL = env.PUBLIC_CRYPTIFY_URL || 'https://fileshare.staging.yivi.app';
```

<small>[Source: config.ts](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/lib/config.ts)</small>

## Encrypt and Upload Files

Create a module that initializes PostGuard and wraps the encryption call:

```ts
import { PostGuard } from '@e4a/pg-js';
import type { CitizenRecipient, OrganisationRecipient } from '$lib/types';
import { PKG_URL, CRYPTIFY_URL } from '$lib/config';

const pg = new PostGuard({ pkgUrl: PKG_URL, cryptifyUrl: CRYPTIFY_URL });

export { pg };

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

<small>[Source: encryption.ts](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/lib/postguard/encryption.ts)</small>

The server load function passes the API key to the page:

```ts
import { PG_API_KEY } from '$lib/config.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return {
    apiKey: PG_API_KEY
  };
};
```

<small>[Source: +page.server.ts](https://github.com/encryption4all/postguard-examples/blob/2b29c1ba18/pg-sveltekit/src/routes/send/+page.server.ts)</small>

The send page uses Svelte 5 reactive state to track progress and handle errors:

```ts
async function handleSend() {
  if (!canSend) return;

  sendState = 'encrypting';
  progress = 0;
  abortController = new AbortController();

  try {
    await encryptAndSend({
      files,
      citizen: { email: citizenEmail, name: citizenName },
      organisation: { email: orgEmail, name: orgName },
      apiKey,
      message: message || null,
      onProgress: (pct) => (progress = pct),
      abortController
    });
    sendState = 'done';
  } catch (e) {
    if (abortController.signal.aborted) {
      sendState = 'idle';
      progress = 0;
    } else {
      sendState = 'error';
      errorMessage = e instanceof Error ? e.message : String(e);
    }
  }
}
```

<small>[Source: +page.svelte#L36-L65](https://github.com/encryption4all/postguard-examples/blob/2b29c1ba18/pg-sveltekit/src/routes/send/+page.svelte#L36-L65)</small>

## Decrypt Files

A page decrypts files from a Cryptify UUID. The UUID and recipient come from URL query parameters (as provided in Cryptify notification emails). The page reads the parameters on mount, opens a Yivi QR widget for identity verification, and auto-downloads the decrypted files. See the [JS SDK Decryption guide](/sdk/js-decryption) for the API used.

The template renders a Yivi QR container that the SDK populates:

```html
<div id="yivi-web"></div>
```

## Yivi QR Styling

The Yivi QR container needs some CSS to render properly:

```css
#yivi-qr, #yivi-web {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```
