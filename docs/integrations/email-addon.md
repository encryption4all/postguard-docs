# Email Addon Integration

This guide explains how to build an email addon (Thunderbird, Outlook, or similar) using the PostGuard SDK. Email addons run in extension environments where DOM-based Yivi rendering is handled in separate popup windows, and dynamic imports may not work as expected.

Both the [Thunderbird addon](https://github.com/encryption4all/postguard-tb-addon) and the [Outlook addon](https://github.com/encryption4all/postguard-outlook-addon) follow the patterns described here.

## Architecture

An email addon typically has three components:

```
+---------------------------+
|  Background script        |  PostGuard SDK lives here
|  - Intercepts send/read   |  - pg.encrypt() / pg.decrypt()
|  - Manages state          |  - pg.email.* helpers
+---------------------------+
           |
           | extension messaging
           |
+---------------------------+
|  Popup windows            |  Yivi QR rendering
|  - Policy editor          |  - Receives session request
|  - Yivi session popup     |  - Returns JWT via messaging
+---------------------------+
           |
+---------------------------+
|  Content scripts / UI     |
|  - Compose action button  |
|  - Decrypt banner         |
|  - Sender identity badges |
+---------------------------+
```

The background script owns the PostGuard SDK instance. The session callback bridges the background script (where encryption/decryption runs) and the popup (where the Yivi QR is shown).

## Initialization with Pre-loaded WASM

Browser extensions often cannot use dynamic `import()` for WASM modules. Pre-load the WASM module and pass it to the constructor:

```ts
// background.ts
import { PostGuard } from '@e4a/pg-js'
import type { WasmModule } from '@e4a/pg-js'

// Load WASM via an extension-compatible path
const pgWasmPath = './pg-wasm/load.js'
const pgWasm: WasmModule = await import(/* @vite-ignore */ pgWasmPath)

const pg = new PostGuard({
  pkgUrl: 'https://pkg.example.com',
  headers: {
    'X-PostGuard-Client-Version': 'Thunderbird,128,pg4tb,0.8.2',
  },
  wasm: pgWasm,
})
```

::: tip
The `wasm` option accepts any object that provides `sealStream` and `StreamUnsealer.new` methods matching the `@e4a/pg-wasm` interface. You can create a custom loader if the standard import does not work in your extension environment.
:::

### Caching PKG keys

The Thunderbird addon caches the Master Public Key in `browser.storage.local` for offline resilience. If the PKG is unreachable, the cached key is used as a fallback:

```ts
import { fetchMPK, fetchVerificationKey } from '@e4a/pg-js'

async function getCachedMPK(pkgUrl: string): Promise<string> {
  const stored = await browser.storage.local.get('pg-mpk')
  try {
    const mpk = await fetchMPK(pkgUrl)
    if (stored['pg-mpk'] !== mpk) {
      await browser.storage.local.set({ 'pg-mpk': mpk })
    }
    return mpk
  } catch {
    if (stored['pg-mpk']) return stored['pg-mpk']
    throw new Error('No master public key available')
  }
}
```

## The Session Callback Pattern

Since the background script cannot render DOM elements, you use `pg.sign.session()` with a callback that opens a popup, waits for the Yivi session to complete, and returns the JWT.

### Step 1: Define the popup bridge

```ts
// background.ts

// Map of open popup windows waiting for a JWT result
const pendingYiviPopups = new Map<number, {
  data: { con: { t: string; v?: string }[]; sort: string }
  resolve: (jwt: string) => void
  reject: (err: Error) => void
}>()

async function createYiviPopup(
  con: { t: string; v?: string }[],
  sort: string
): Promise<string> {
  const popup = await browser.windows.create({
    url: '/popup/yivi.html',
    type: 'popup',
    width: 420,
    height: 560,
  })

  return new Promise<string>((resolve, reject) => {
    pendingYiviPopups.set(popup.id!, {
      data: { con, sort },
      resolve,
      reject,
    })

    // Handle popup close without result
    const onRemoved = (windowId: number) => {
      if (windowId === popup.id) {
        browser.windows.onRemoved.removeListener(onRemoved)
        const pending = pendingYiviPopups.get(windowId)
        if (pending) {
          pendingYiviPopups.delete(windowId)
          pending.reject(new Error('Yivi session cancelled'))
        }
      }
    }
    browser.windows.onRemoved.addListener(onRemoved)
  })
}
```

### Step 2: Handle popup messages

```ts
// background.ts
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'yiviPopupInit') {
    const pending = pendingYiviPopups.get(sender.tab?.windowId!)
    return Promise.resolve(pending?.data)
  }

  if (message.type === 'yiviPopupDone') {
    const pending = pendingYiviPopups.get(sender.tab?.windowId!)
    if (pending) {
      pendingYiviPopups.delete(sender.tab?.windowId!)
      pending.resolve(message.jwt)
      browser.windows.remove(sender.tab?.windowId!)
    }
    return Promise.resolve()
  }
})
```

### Step 3: The popup page

The popup uses the SDK's `runYiviSession()` utility to handle the full Yivi flow:

```html
<!-- popup/yivi.html -->
<div id="yivi-qr"></div>
<script type="module" src="./yivi-popup.js"></script>
```

```ts
// popup/yivi-popup.ts
import { runYiviSession } from '@e4a/pg-js'

const data = await browser.runtime.sendMessage({ type: 'yiviPopupInit' })

try {
  const jwt = await runYiviSession({
    pkgUrl: PKG_URL,
    element: '#yivi-qr',
    constraints: data.con,
    sort: data.sort,
  })
  await browser.runtime.sendMessage({ type: 'yiviPopupDone', jwt })
} catch (err) {
  window.close()
}
```

Alternatively, you can set up the Yivi session manually using the Yivi packages directly:

```ts
import YiviCore from '@privacybydesign/yivi-core'
import YiviClient from '@privacybydesign/yivi-client'
import YiviWeb from '@privacybydesign/yivi-web'

const yivi = new YiviCore({
  session: {
    url: PKG_URL,
    start: {
      url: (o) => `${o.url}/v2/request/start`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ con: data.con }),
    },
    result: {
      url: (o, { sessionToken }) =>
        `${o.url}/v2/irma/jwt/${sessionToken}`,
      parseResponse: (r) => r.text(),
    },
  },
  element: '#yivi-qr',
  language: 'en',
})

yivi.use(YiviWeb)
yivi.use(YiviClient)

const jwt = await yivi.start()
```

## Email Encryption Flow

With the session callback in place, the encryption flow intercepts the compose send event:

```ts
// background.ts
async function handleBeforeSend(tab, details) {
  const fromEmail = extractEmail(details.from)

  // 1. Build the inner MIME
  const mimeData = pg.email.buildMime({
    from: details.from,
    to: [...details.to],
    cc: [...details.cc],
    subject: details.subject,
    htmlBody: details.body,
    date: new Date(),
    attachments: await getComposeAttachments(tab.id),
  })

  // 2. Build recipients from To and CC
  const recipients = [...details.to, ...details.cc].map((r) =>
    pg.recipient.email(extractEmail(r))
  )

  // 3. Encrypt with session callback (opens Yivi popup)
  const ciphertext = await pg.encrypt({
    sign: pg.sign.session(
      async ({ con, sort }) => createYiviPopup(con, sort),
      { senderEmail: fromEmail }
    ),
    recipients,
    data: mimeData,
  })

  // 4. Create envelope
  const envelope = pg.email.createEnvelope({
    encrypted: ciphertext,
    from: details.from,
  })

  // 5. Replace the email content
  await clearAttachments(tab.id)
  await browser.compose.addAttachment(tab.id, {
    file: envelope.attachment,
  })

  return {
    details: {
      subject: envelope.subject,
      body: envelope.htmlBody,
      plainTextBody: envelope.plainTextBody,
    },
  }
}
```

The Thunderbird addon also stores a copy of sent encrypted messages in a "PostGuard Sent" folder in Local Folders.

### BCC limitation

PostGuard does not support BCC recipients. The Thunderbird addon blocks sending if any BCC recipients are present when encryption is enabled.

## Email Decryption Flow

```ts
async function handleDecryptMessage(messageId: number) {
  // 1. Get email content
  const attachments = await browser.messages.listAttachments(messageId)
  const attData = await Promise.all(
    attachments.map(async (att) => {
      const file = await browser.messages.getAttachmentFile(
        messageId, att.partName
      )
      return { name: att.name, data: await file.arrayBuffer() }
    })
  )

  const full = await browser.messages.getFull(messageId)
  const htmlBody = findHtmlBody(full)

  // 2. Extract ciphertext
  const ciphertext = pg.email.extractCiphertext({
    htmlBody: htmlBody ?? undefined,
    attachments: attData,
  })

  if (!ciphertext) return { ok: false, error: 'No ciphertext found' }

  // 3. Decrypt with session callback
  const result = await pg.decrypt({
    data: ciphertext,
    session: async ({ con, sort }) => {
      return createYiviPopup(con, sort)
    },
    recipient: recipientEmail,
  })

  // 4. Parse the decrypted MIME and display
  const plaintext = new TextDecoder().decode(result.plaintext)
  // Use a MIME parser (e.g. postal-mime) to extract subject, body, attachments
}
```

The Thunderbird addon goes further: after decryption, it imports the decrypted message back into the folder (with threading headers preserved) and deletes the encrypted original. This makes the decrypted message appear naturally in the conversation.

## Detecting PostGuard Emails

Check if a message is PostGuard-encrypted by looking for the attachment or armored payload:

```ts
import { extractArmoredPayload } from '@e4a/pg-js'

async function isPostGuardEncrypted(msgId: number): Promise<boolean> {
  // Check for postguard.encrypted attachment
  const attachments = await browser.messages.listAttachments(msgId)
  if (attachments.some((a) => a.name === 'postguard.encrypted')) {
    return true
  }

  // Check for armored payload in HTML body
  const full = await browser.messages.getFull(msgId)
  const html = findHtmlBody(full)
  if (html && extractArmoredPayload(html)) {
    return true
  }

  return false
}
```

## Reply Threading

The Thunderbird addon auto-enables encryption when the user replies to an encrypted message. It also injects threading headers (`In-Reply-To`, `References`) and an `X-PostGuard` marker into decrypted messages so they thread correctly in the mail client.

## Sender Identity Badges

After decryption, the addons display the sender's verified identity attributes as badges. The Thunderbird addon shows icons for different attribute types (envelope for email, phone for mobile, etc.) in a banner above the decrypted message content.

## Outlook-Specific Notes

The Outlook addon uses the Office JS API instead of WebExtension APIs:

- Manifest: XML-based (`manifest.xml`) instead of `manifest.json`
- Taskpane: decryption UI shown in a side panel when reading encrypted messages
- Compose pane: encryption toggle and policy editor
- Dialog: `Office.context.ui.displayDialogAsync()` for Yivi popups, with `messageParent()` to return JWTs
- Event handlers: `OnMessageSend` for encryption, `OnMessageRead` for auto-decryption
- State: `sessionStorage` for compose state (encryption toggle, policies, signing identity)

The core encryption/decryption logic is the same. Only the UI plumbing and extension APIs differ.

## Bundling Considerations

Email extension environments have specific bundling requirements:

- WASM loading: use the `wasm` constructor option with a pre-loaded module. Copy the WASM binary to your extension's output directory during build.
- Dynamic imports: avoid where possible. Use static imports or extension-compatible loading patterns.
- Content Security Policy: your extension manifest must allow WASM execution (`'wasm-unsafe-eval'` in Manifest V3).
- File size: the `@e4a/pg-wasm` module is around 2 MB. Load it eagerly at startup rather than on first use.
- EventSource polyfill: the Yivi client uses `EventSource` for server-sent events. In Thunderbird, you may need to shim this.

```ts
// Load WASM eagerly at startup
let pgWasm: WasmModule | null = null

const wasmPromise = import(/* @vite-ignore */ './pg-wasm/load.js')
  .then((mod) => { pgWasm = mod })
  .catch((e) => console.error('WASM load failed:', e))

// Wait for WASM before creating PostGuard instance
await wasmPromise
const pg = new PostGuard({ pkgUrl: PKG_URL, wasm: pgWasm! })
```

### Build tool: esbuild

The Thunderbird addon uses esbuild for bundling, with separate entry points for each component:

- Background script: ESM format, `@e4a/pg-wasm` marked as external
- Content scripts and popups: IIFE format for injection into pages
- WASM binary: copied from `node_modules/@e4a/pg-wasm` to the output directory

Environment variables (`PKG_URL`, `POSTGUARD_WEBSITE_URL`) are injected at build time via esbuild's `define` option.
