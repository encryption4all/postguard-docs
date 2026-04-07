# Web Application Integration

This guide shows how to integrate PostGuard encryption and decryption into a web application. The examples use SvelteKit (matching the [postguard-examples](https://github.com/encryption4all) repository), but the patterns apply to any frontend framework.

## Setup

Install the SDK, WASM module, and Yivi packages:

```sh
npm install @e4a/pg-js @e4a/pg-wasm
npm install @privacybydesign/yivi-core @privacybydesign/yivi-client @privacybydesign/yivi-web
```

You also need Vite plugins for WASM support:

```sh
npm install -D vite-plugin-wasm vite-plugin-top-level-await
```

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default {
  plugins: [sveltekit(), wasm(), topLevelAwait()],
}
```

Create a shared PostGuard instance:

```ts
// src/lib/postguard.ts
import { PostGuard } from '@e4a/pg-js'

export const pg = new PostGuard({
  pkgUrl: import.meta.env.VITE_PKG_URL,
  cryptifyUrl: import.meta.env.VITE_CRYPTIFY_URL,
})
```

## Encrypt and Upload Files

A SvelteKit component that encrypts files and uploads them to Cryptify. This example uses `encryptAndDeliver()` with an API key, matching the PostGuard for Business pattern:

```svelte
<!-- src/routes/send/+page.svelte -->
<script lang="ts">
  import { pg } from '$lib/postguard'
  import { NetworkError } from '@e4a/pg-js'

  let files = $state<FileList | null>(null)
  let recipientEmail = $state('')
  let apiKey = $state('')
  let progress = $state(0)
  let error = $state('')
  let done = $state(false)

  async function handleSend() {
    if (!files || !recipientEmail || !apiKey) return

    error = ''
    done = false
    progress = 0

    try {
      await pg.encryptAndDeliver({
        sign: pg.sign.apiKey(apiKey),
        recipients: [pg.recipient.email(recipientEmail)],
        files,
        onProgress: (pct) => { progress = pct },
        delivery: {
          language: 'EN',
          confirmToSender: false,
        },
      })
      done = true
    } catch (err) {
      if (err instanceof NetworkError) {
        error = `Server error (${err.status}). Please try again.`
      } else if (err instanceof Error) {
        error = err.message
      }
    }
  }
</script>

<h1>Send Encrypted Files</h1>

<form onsubmit={(e) => { e.preventDefault(); handleSend() }}>
  <label>
    Recipient email
    <input type="email" bind:value={recipientEmail} required />
  </label>

  <label>
    API Key
    <input type="text" bind:value={apiKey} required />
  </label>

  <label>
    Files
    <input type="file" bind:files multiple required />
  </label>

  <button type="submit">Encrypt & Send</button>
</form>

{#if progress > 0 && !done}
  <progress value={progress} max="100">{progress}%</progress>
{/if}

{#if done}
  <p>Files encrypted and sent to {recipientEmail}.</p>
{/if}

{#if error}
  <p class="error">{error}</p>
{/if}
```

### Using Yivi signing (peer-to-peer)

If you want the sender to prove their identity via Yivi instead of an API key:

```ts
await pg.encryptAndUpload({
  sign: pg.sign.yivi({
    element: '#yivi-qr',
    senderEmail: 'sender@example.com',
    includeSender: true,
  }),
  recipients: [pg.recipient.email('alice@example.com')],
  files: selectedFiles,
  onProgress: (pct) => { progress = pct },
})
```

Add a container element for the QR code:

```html
<div id="yivi-qr" style="min-height: 300px"></div>
```

## Decrypt Files

A component that decrypts files from a Cryptify UUID:

```svelte
<!-- src/routes/download/+page.svelte -->
<script lang="ts">
  import { pg } from '$lib/postguard'
  import {
    IdentityMismatchError,
    DecryptionError,
    NetworkError,
  } from '@e4a/pg-js'

  let result = $state<Awaited<ReturnType<typeof pg.decrypt>> | null>(null)
  let error = $state('')
  let senderEmail = $state('')

  // Read UUID from URL query parameter
  const params = new URLSearchParams(window.location.search)
  const uuid = params.get('uuid')
  const recipient = params.get('recipient')

  async function handleDecrypt() {
    if (!uuid) return
    error = ''
    result = null

    try {
      const decrypted = await pg.decrypt({
        uuid,
        element: '#yivi-web',
        recipient: recipient || undefined,
      })

      result = decrypted

      // Extract sender identity
      if ('sender' in decrypted && decrypted.sender) {
        const emailAttr = decrypted.sender.public.con.find(
          (a) => a.t === 'pbdf.sidn-pbdf.email.email'
        )
        senderEmail = emailAttr?.v ?? 'Unknown'
      }

      // Auto-download the decrypted files
      if ('download' in decrypted) {
        decrypted.download()
      }
    } catch (err) {
      if (err instanceof IdentityMismatchError) {
        error = 'Your identity does not match the intended recipient.'
      } else if (err instanceof DecryptionError) {
        error = `Decryption failed: ${err.message}`
      } else if (err instanceof NetworkError) {
        error = err.status === 404
          ? 'File not found. It may have expired.'
          : `Server error (${err.status}).`
      } else if (err instanceof Error) {
        error = err.message
      }
    }
  }
</script>

<h1>Decrypt Files</h1>

<div id="yivi-web" style="min-height: 300px"></div>

<button onclick={handleDecrypt}>Decrypt</button>

{#if result && 'files' in result}
  <div>
    <p>Sent by: {senderEmail}</p>
    <p>Files: {result.files.join(', ')}</p>
    <button onclick={() => result?.download('decrypted.zip')}>
      Download Again
    </button>
  </div>
{/if}

{#if error}
  <p class="error">{error}</p>
{/if}
```

## Custom Policies

For applications that need attribute-based access control beyond email:

```ts
const recipients = [
  // Only someone who can prove this exact name AND email can decrypt
  pg.recipient.withPolicy('alice@example.com', [
    { t: 'pbdf.sidn-pbdf.email.email', v: 'alice@example.com' },
    { t: 'pbdf.gemeente.personalData.fullname', v: 'Alice Smith' },
  ]),

  // Organisation-level: anyone with a @company.nl email can decrypt
  pg.recipient.emailDomain('info@company.nl'),
]
```

You can also require additional attributes like mobile number or date of birth:

```ts
pg.recipient.withPolicy('alice@example.com', [
  { t: 'pbdf.sidn-pbdf.email.email', v: 'alice@example.com' },
  { t: 'pbdf.sidn-pbdf.mobilenumber.mobilenumber', v: '+31612345678' },
  { t: 'pbdf.gemeente.personalData.dateofbirth', v: '1990-01-15' },
])
```

## Yivi QR Styling

The Yivi QR container needs some CSS to render properly. Import the Yivi CSS or add minimal styles:

```css
#yivi-qr, #yivi-web {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

## Server-Side Rendering

The SDK uses browser APIs (`File`, `ReadableStream`, `WritableStream`) and WebAssembly. Make sure encryption and decryption code only runs on the client:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import type { PostGuard } from '@e4a/pg-js'

  let pg = $state<PostGuard | null>(null)

  onMount(async () => {
    const { PostGuard } = await import('@e4a/pg-js')
    pg = new PostGuard({
      pkgUrl: import.meta.env.VITE_PKG_URL,
      cryptifyUrl: import.meta.env.VITE_CRYPTIFY_URL,
    })
  })
</script>
```

Alternatively, create a lazy-loading helper:

```ts
// src/lib/postguard.ts
let instance: PostGuard | null = null

export async function getPostGuard() {
  if (!instance) {
    const { PostGuard } = await import('@e4a/pg-js')
    instance = new PostGuard({
      pkgUrl: import.meta.env.VITE_PKG_URL,
      cryptifyUrl: import.meta.env.VITE_CRYPTIFY_URL,
    })
  }
  return instance
}
```

## Environment Variables

Configure the PKG and Cryptify URLs via environment variables:

```sh
# .env
VITE_PKG_URL=https://pkg.staging.yivi.app
VITE_CRYPTIFY_URL=https://fileshare.staging.yivi.app
```

For API key authentication, keep the key server-side only:

```ts
// src/lib/config.server.ts (SvelteKit server-only module)
export const PG_API_KEY = process.env.PG_API_KEY
```
