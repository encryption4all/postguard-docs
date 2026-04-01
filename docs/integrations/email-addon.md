# Email Addon Integration

This guide explains how to build an email addon (Thunderbird, Outlook, or similar) using the PostGuard SDK. Email addons present a unique challenge: they run in an extension environment where DOM-based Yivi rendering is handled in separate popup windows, and dynamic imports may not work as expected.

## Architecture

An email addon typically has three components:

```
+---------------------------+
|  Background script        |  PostGuard SDK lives here
|  - Intercepts send/read   |  - pg.encrypt() / pg.decrypt()
|  - Manages state          |  - pg.email.* helpers
+---------------------------+
           |
           | browser.runtime messages
           |
+---------------------------+
|  Popup windows            |  Yivi QR rendering
|  - Policy editor          |  - Receives session request
|  - Yivi session popup     |  - Returns JWT via messaging
+---------------------------+
           |
+---------------------------+
|  Content scripts          |  UI in compose/display
|  - Compose overlay        |
|  - Message display badge  |
+---------------------------+
```

The key insight is that the **session callback** bridges the background script (where the SDK runs) and the popup (where the Yivi QR is shown).

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
  pkgUrl: 'https://pkg.postguard.eu',
  headers: {
    'X-PostGuard-Client-Version': 'Thunderbird,128,pg4tb,0.8.0',
  },
  wasm: pgWasm,
})
```

::: tip
The `wasm` option accepts any object that provides `sealStream` and `StreamUnsealer.new` methods matching the `@e4a/pg-wasm` interface. You can create a custom loader if the standard import does not work in your extension environment.
:::

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

```html
<!-- popup/yivi.html -->
<div id="yivi-qr"></div>
<script type="module" src="./yivi-popup.js"></script>
```

```ts
// popup/yivi-popup.ts
import YiviCore from '@privacybydesign/yivi-core'
import YiviClient from '@privacybydesign/yivi-client'
import YiviWeb from '@privacybydesign/yivi-web'

const data = await browser.runtime.sendMessage({ type: 'yiviPopupInit' })

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

try {
  const jwt = await yivi.start()
  await browser.runtime.sendMessage({ type: 'yiviPopupDone', jwt })
} catch (err) {
  window.close()
}
```

## Email Encryption Flow

With the session callback in place, the encryption flow in `onBeforeSend`:

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

  // 2. Build recipients
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
    session: async ({ con, sort, hints }) => {
      return createYiviPopup(con, sort)
    },
    recipient: recipientEmail,
  })

  // 4. Parse and display the decrypted MIME
  const plaintext = new TextDecoder().decode(result.plaintext)
  // ... parse MIME and display
}
```

## Detecting PostGuard Emails

Check if a message is PostGuard-encrypted by looking for the attachment or armored payload:

```ts
import { extractArmoredPayload } from '@e4a/pg-js'

async function isPGEncrypted(msgId: number): Promise<boolean> {
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

## Custom Headers

Inject PostGuard headers into sent emails for identification:

```ts
import { injectMimeHeaders } from '@e4a/pg-js'

const mime = injectMimeHeaders(rawMime, {
  'X-PostGuard': 'encrypted',
  'X-PostGuard-Client-Version': 'pg4tb/0.8.0',
})
```

## Bundling Considerations

Email extension environments have specific bundling requirements:

- **WASM loading**: Use the `wasm` constructor option with a pre-loaded module
- **Dynamic imports**: Avoid them where possible; use static imports or extension-compatible loading patterns
- **Content Security Policy**: Ensure your extension manifest allows WASM execution
- **File size**: The `@e4a/pg-wasm` module is substantial; consider loading it asynchronously at startup rather than on first use

```ts
// Load WASM eagerly at startup, not on first encrypt/decrypt
let pgWasm: WasmModule | null = null

const wasmPromise = import(/* @vite-ignore */ './pg-wasm/load.js')
  .then((mod) => { pgWasm = mod })
  .catch((e) => console.error('WASM load failed:', e))

// Wait for WASM before creating PostGuard instance
await wasmPromise
const pg = new PostGuard({ pkgUrl: PKG_URL, wasm: pgWasm! })
```
