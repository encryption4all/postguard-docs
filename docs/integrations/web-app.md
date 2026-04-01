# Web Application Integration

This guide shows how to integrate PostGuard encryption and decryption into a web application. The examples use SvelteKit, but the patterns apply to any frontend framework.

## Setup

Install the SDK and Yivi packages:

```sh
npm install @e4a/pg-js @e4a/pg-wasm
npm install @privacybydesign/yivi-core @privacybydesign/yivi-client @privacybydesign/yivi-web
```

Create a shared PostGuard instance:

```ts
// src/lib/postguard.ts
import { PostGuard } from '@e4a/pg-js'

export const pg = new PostGuard({
  pkgUrl: 'https://pkg.postguard.eu',
  cryptifyUrl: 'https://cryptify.postguard.eu',
})
```

## Encrypt and Upload Files

A SvelteKit component that encrypts files and uploads them to Cryptify:

```svelte
<!-- src/routes/encrypt/+page.svelte -->
<script lang="ts">
  import { pg } from '$lib/postguard'
  import { IdentityMismatchError, NetworkError } from '@e4a/pg-js'

  let files: FileList | null = null
  let recipients = ''
  let senderEmail = ''
  let progress = 0
  let resultUuid = ''
  let error = ''

  async function handleEncrypt() {
    if (!files || !senderEmail || !recipients) return

    error = ''
    resultUuid = ''
    progress = 0

    try {
      const recipientList = recipients
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
        .map((e) => pg.recipient.email(e))

      const result = await pg.encryptAndUpload({
        sign: pg.sign.yivi({
          element: '#yivi-qr',
          senderEmail,
        }),
        recipients: recipientList,
        files,
        onProgress: (pct) => {
          progress = pct
        },
      })

      resultUuid = result.uuid
    } catch (err) {
      if (err instanceof NetworkError) {
        error = `Server error (${err.status}). Please try again.`
      } else if (err instanceof Error) {
        error = err.message
      }
    }
  }
</script>

<h1>Encrypt Files</h1>

<form on:submit|preventDefault={handleEncrypt}>
  <label>
    Your email
    <input type="email" bind:value={senderEmail} required />
  </label>

  <label>
    Recipients (comma-separated)
    <input type="text" bind:value={recipients} required />
  </label>

  <label>
    Files
    <input type="file" bind:files multiple required />
  </label>

  <div id="yivi-qr"></div>

  <button type="submit">Encrypt & Upload</button>
</form>

{#if progress > 0 && !resultUuid}
  <progress value={progress} max="100">{progress}%</progress>
{/if}

{#if resultUuid}
  <div class="success">
    <p>Encrypted successfully!</p>
    <p>Share this link with recipients:</p>
    <code>https://cryptify.postguard.eu/d/{resultUuid}</code>
  </div>
{/if}

{#if error}
  <div class="error">{error}</div>
{/if}
```

## Decrypt Files

A component that decrypts files from a Cryptify UUID:

```svelte
<!-- src/routes/decrypt/[uuid]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores'
  import { pg } from '$lib/postguard'
  import {
    IdentityMismatchError,
    DecryptionError,
    NetworkError,
  } from '@e4a/pg-js'

  let result: Awaited<ReturnType<typeof pg.decrypt>> | null = null
  let error = ''
  let senderEmail = ''

  async function handleDecrypt() {
    error = ''
    result = null

    try {
      const decrypted = await pg.decrypt({
        uuid: $page.params.uuid,
        element: '#yivi-qr',
      })

      result = decrypted

      // Extract sender identity
      if ('sender' in decrypted && decrypted.sender) {
        const emailAttr = decrypted.sender.public.con.find(
          (a) => a.t === 'pbdf.sidn-pbdf.email.email'
        )
        senderEmail = emailAttr?.v ?? 'Unknown'
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

<div id="yivi-qr"></div>

<button on:click={handleDecrypt}>Decrypt</button>

{#if result && 'files' in result}
  <div class="success">
    <p>Sent by: {senderEmail}</p>
    <p>Files:</p>
    <ul>
      {#each result.files as file}
        <li>{file}</li>
      {/each}
    </ul>
    <button on:click={() => result?.download('decrypted.zip')}>
      Download All
    </button>
  </div>
{/if}

{#if error}
  <div class="error">{error}</div>
{/if}
```

## Encrypt and Deliver via Email

If you want Cryptify to send notification emails to recipients automatically:

```ts
const result = await pg.encryptAndDeliver({
  sign: pg.sign.yivi({
    element: '#yivi-qr',
    senderEmail: 'sender@example.com',
    includeSender: true,
  }),
  recipients: [
    pg.recipient.email('alice@example.com'),
    pg.recipient.email('bob@example.com'),
  ],
  files: selectedFiles,
  delivery: {
    message: 'Here are the documents you requested.',
    language: 'EN',
    confirmToSender: true,
  },
})
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

## Yivi QR Styling

The Yivi QR container needs some CSS to render properly. Import the Yivi CSS or add minimal styles:

```css
#yivi-qr {
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
  import { browser } from '$app/environment'
  import { onMount } from 'svelte'

  let pg: PostGuard | null = null

  onMount(async () => {
    const { PostGuard } = await import('@e4a/pg-js')
    pg = new PostGuard({
      pkgUrl: 'https://pkg.postguard.eu',
      cryptifyUrl: 'https://cryptify.postguard.eu',
    })
  })
</script>
```

Alternatively, use dynamic imports in your shared module:

```ts
// src/lib/postguard.ts
export async function getPostGuard() {
  const { PostGuard } = await import('@e4a/pg-js')
  return new PostGuard({
    pkgUrl: 'https://pkg.postguard.eu',
    cryptifyUrl: 'https://cryptify.postguard.eu',
  })
}
```
