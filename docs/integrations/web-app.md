# Web Application Integration

This guide shows how to integrate PostGuard encryption and decryption into a web application. The examples come from the [postguard-examples](https://github.com/encryption4all/postguard-examples) repository and use SvelteKit, but the patterns apply to any frontend framework.

## Setup

Install the SDK:

```sh
npm install @e4a/pg-js
```

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

Configure the PKG and Cryptify URLs via environment variables:

```sh
# Public (available in browser)
PUBLIC_PKG_URL=https://pkg.staging.yivi.app
PUBLIC_CRYPTIFY_URL=https://fileshare.staging.yivi.app
PUBLIC_APP_NAME=PostGuard for Business Example

# Server-only
PG_API_KEY=PG-API-your-key-here
```

<small>[Source: .env.example](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/.env.example)</small>

Keep the API key server-side only:

```ts
import { env } from '$env/dynamic/private';

export const PG_API_KEY = env['PG_API_KEY'] ?? '';
```

<small>[Source: config.server.ts](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/lib/config.server.ts)</small>

The public config provides the PKG and Cryptify URLs to the browser:

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

Then build a page that calls this function. The server load function passes the API key to the page:

```ts
import { PG_API_KEY } from '$lib/config.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return {
    apiKey: PG_API_KEY
  };
};
```

<small>[Source: +page.server.ts](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/routes/send/+page.server.ts)</small>

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

<small>[Source: +page.svelte#L36-L65](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/routes/send/+page.svelte#L36-L65)</small>

## Decrypt Files

A page that decrypts files from a Cryptify UUID. The UUID and recipient can come from URL query parameters (as provided in Cryptify notification emails):

```ts
import { PostGuard, IdentityMismatchError } from '@e4a/pg-js';
import type { DecryptFileResult } from '@e4a/pg-js';
import { PKG_URL, CRYPTIFY_URL } from '$lib/config';

const pg = new PostGuard({ pkgUrl: PKG_URL, cryptifyUrl: CRYPTIFY_URL });

async function startDecrypt() {
  if (!uuid) {
    uuid = manualUuid;
    if (!uuid) return;
  }

  dlState = 'ready';
  await tick();

  try {
    const opened = pg.open({ uuid });
    const decrypted = await opened.decrypt({
      element: '#yivi-web',
      recipient: recipientParam || undefined
    });

    result = decrypted as DecryptFileResult;
    senderEmail = result.sender?.email ?? '';
    dlState = 'done';

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

The template renders a Yivi QR container that the SDK populates:

```html
<div id="yivi-web"></div>
```

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
