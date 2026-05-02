# postguard-tb-addon

[GitHub](https://github.com/encryption4all/postguard-tb-addon) · TypeScript · Thunderbird Extension

End-to-end email encryption extension for Mozilla Thunderbird. Uses identity-based encryption via [Yivi](https://yivi.app) so users can send and receive encrypted emails without managing keys.

## How It Works

The addon integrates into Thunderbird's compose and message display windows. When sending, it encrypts the email body and attachments using `@e4a/pg-js` and wraps the result in a standard email with a PostGuard placeholder body and an encrypted attachment. When viewing a received PostGuard email, it detects the encrypted attachment, prompts the user to authenticate with Yivi, and decrypts the content inline.

## Architecture

```
+---------------------------+
|  Background script        |  Standalone SDK email helpers
|  - Intercepts send/read   |  - buildMime / extractCiphertext
|  - Manages state          |  - Opens crypto popup for encrypt/decrypt
+---------------------------+
           |
           | extension messaging
           |
+---------------------------+
|  Popup windows            |  PostGuard SDK instance + Yivi QR
|  - Crypto popup           |  - pg.encrypt() with pg.sign.yivi()
|  - Policy editor          |  - pg.open().decrypt() with element
+---------------------------+
           |
+---------------------------+
|  Content scripts / UI     |
|  - Compose action button  |
|  - Decrypt banner         |
|  - Sender identity badges |
+---------------------------+
```

The popup owns all crypto operations and the PostGuard SDK instance. The background script uses standalone email helper functions (imported directly from `@e4a/pg-js`) for MIME building and ciphertext extraction, without instantiating PostGuard.

### Popup-Owns-Crypto Pattern

The background script cannot render DOM elements, and the Yivi QR code needs a visible HTML element. The addon solves this by opening a popup window that creates its own `PostGuard` instance, runs the full encrypt or decrypt flow, and sends the result back.

The background script opens a popup, registers it in a pending map before the popup can send its init message (preventing a race condition), and waits for the result:

```ts
async function openCryptoPopup(data: CryptoPopupInitData): Promise<CryptoPopupResult> {
  const { promise, resolve, reject } = Promise.withResolvers<CryptoPopupResult>();

  const popup = await browser.windows.create({
    url: "pages/yivi-popup/yivi-popup.html",
    type: "popup",
    height: 700,
    width: 620,
  });

  const popupId = popup.id;

  // Register IMMEDIATELY after create, before the popup script can send cryptoPopupInit
  pendingCryptoPopups.set(popupId, { data, resolve, reject });

  const closeListener = (closedId: number) => {
    if (closedId === popupId) {
      const pending = pendingCryptoPopups.get(popupId);
      if (pending) {
        pending.reject(new Error("Popup closed"));
        pendingCryptoPopups.delete(popupId);
      }
      browser.windows.onRemoved.removeListener(closeListener);
    }
  };
  browser.windows.onRemoved.addListener(closeListener);

  await browser.windows.update(popupId, {
    drawAttention: true,
    focused: true,
  });

  return keepAlive("crypto-popup", promise) as Promise<CryptoPopupResult>;
}
```

<small>[Source: background.ts#L260-L293](https://github.com/encryption4all/postguard-tb-addon/blob/57234eebd32d64bd011086fe89ecdd7ac40fc15d/src/background/background.ts#L260-L293)</small>

The popup resolves its own window ID, requests its operation data from the background, then creates a PostGuard instance and runs the operation:

```ts
import { PostGuard } from "@e4a/pg-js";

async function init() {
  const win = await browser.windows.getCurrent();
  const windowId = win.id;

  const data = (await browser.runtime.sendMessage({
    type: "cryptoPopupInit",
    windowId,
  })) as CryptoPopupInitData | null;

  if (!data) {
    showError("Failed to initialize session.");
    return;
  }

  // Create PostGuard instance for this popup
  const pg = new PostGuard(data.config);

  try {
    if (data.operation === "encrypt") {
      await handleEncrypt(pg, data, windowId);
    } else {
      await handleDecrypt(pg, data, windowId);
    }

    // Auto-close after a short delay
    setTimeout(() => browser.windows.remove(windowId), 750);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Operation failed.";
    await browser.runtime.sendMessage({
      type: "cryptoPopupError",
      windowId,
      error: message,
    });
    showError(message);
  }
}
```

<small>[Source: yivi-popup.ts#L21-L88](https://github.com/encryption4all/postguard-tb-addon/blob/57234eebd32d64bd011086fe89ecdd7ac40fc15d/src/pages/yivi-popup/yivi-popup.ts#L21-L88)</small>

### Encrypt Handler

The popup rebuilds typed recipients from serialized data, encrypts with element-based Yivi signing, creates the email envelope, and sends the result back:

```ts
async function handleEncrypt(pg: PostGuard, data: EncryptPopupData, windowId: number) {
  const mimeData = fromBase64(data.mimeDataBase64);

  const recipients = data.recipients.map((r) => {
    const base = r.type === "emailDomain"
      ? pg.recipient.emailDomain(r.email)
      : pg.recipient.email(r.email);
    for (const attr of r.extraAttributes ?? []) {
      base.extraAttribute(attr.t, attr.v);
    }
    return base;
  });

  const sealed = pg.encrypt({
    sign: pg.sign.yivi({
      element: "#yivi-web-form",
      senderEmail: data.senderEmail,
    }),
    recipients,
    data: mimeData,
  });

  const envelope = await pg.email.createEnvelope({
    sealed,
    from: data.from,
    websiteUrl: data.websiteUrl,
  });

  const attBytes = new Uint8Array(await envelope.attachment.arrayBuffer());

  await browser.runtime.sendMessage({
    type: "cryptoPopupDone",
    windowId,
    result: {
      operation: "encrypt",
      subject: envelope.subject,
      htmlBody: envelope.htmlBody,
      plainTextBody: envelope.plainTextBody,
      attachmentBase64: toBase64(attBytes),
      attachmentSize: attBytes.byteLength,
    },
  });
}
```

<small>[Source: yivi-popup.ts#L90-L136](https://github.com/encryption4all/postguard-tb-addon/blob/57234eebd32d64bd011086fe89ecdd7ac40fc15d/src/pages/yivi-popup/yivi-popup.ts#L90-L136)</small>

::: warning Tier 3 envelopes have no attachment
As of `@e4a/pg-js` 0.10, `envelope.attachment` is `File | null` and is `null` for tier 3 envelopes (ciphertext over `PG_MAX_ATTACHMENT_SIZE`, ~10 MB by default). The snippet above dereferences `envelope.attachment.arrayBuffer()` directly, so it works only when the payload falls into tier 1 or tier 2. The addon needs a null branch that skips the `attachmentBase64` field and relies on the Cryptify download link in `envelope.htmlBody` instead. Tracked separately. See [Email Helpers](/sdk/js-email-helpers#createenvelope) for the tier model.
:::

### Decrypt Handler

```ts
async function handleDecrypt(pg: PostGuard, data: DecryptPopupData, windowId: number) {
  const ciphertext = fromBase64(data.ciphertextBase64);

  const opened = pg.open({ data: ciphertext });
  const result = (await opened.decrypt({
    element: "#yivi-web-form",
    recipient: data.recipientEmail,
  })) as DecryptDataResult;

  await browser.runtime.sendMessage({
    type: "cryptoPopupDone",
    windowId,
    result: {
      operation: "decrypt",
      plaintextBase64: toBase64(result.plaintext),
      sender: result.sender,
    },
  });
}
```

<small>[Source: yivi-popup.ts#L138-L157](https://github.com/encryption4all/postguard-tb-addon/blob/57234eebd32d64bd011086fe89ecdd7ac40fc15d/src/pages/yivi-popup/yivi-popup.ts#L138-L157)</small>

## Email Encryption Flow

The background script intercepts the compose send event, builds the MIME, and delegates encryption to the popup:

1. Build attachments list from the compose tab
2. Fetch threading headers if replying
3. Build the inner MIME using `buildMime()` (standalone import from `@e4a/pg-js`)
4. Serialize recipients with custom policies for the popup
5. Remove original attachments so they don't send unencrypted
6. Open the crypto popup, which encrypts and returns the envelope
7. Attach the encrypted file and replace the email body/subject

```ts
import { buildMime } from "@e4a/pg-js";

// Build inner MIME using standalone SDK helper
const mimeData = buildMime({
  from: details.from,
  to: [...details.to],
  cc: [...details.cc],
  subject: originalSubject,
  htmlBody: details.isPlainText ? undefined : details.body,
  plainTextBody: details.isPlainText ? details.plainTextBody : undefined,
  date,
  inReplyTo,
  references,
  attachments: attachmentData,
});

// Delegate encryption to popup
const result = await openCryptoPopup({
  operation: "encrypt",
  config: { pkgUrl: PKG_URL!, cryptifyUrl: CRYPTIFY_URL, headers: PG_CLIENT_HEADER },
  mimeDataBase64: toBase64(mimeData),
  recipients: serializedRecipients,
  senderEmail: from,
  from: details.from,
  websiteUrl: POSTGUARD_WEBSITE_URL,
}) as EncryptPopupResult;

// Attach encrypted file and replace body/subject
const attBytes = fromBase64(result.attachmentBase64);
const attFile = new File([attBytes as BlobPart], "postguard.encrypted", {
  type: "application/postguard; charset=utf-8",
});
await browser.compose.addAttachment(tab.id, { file: attFile });

resolve({
  details: {
    subject: result.subject,
    body: result.htmlBody,
    plainTextBody: result.plainTextBody,
  },
});
```

<small>[Source: background.ts#L382-L456](https://github.com/encryption4all/postguard-tb-addon/blob/57234eebd32d64bd011086fe89ecdd7ac40fc15d/src/background/background.ts#L382-L456)</small>

BCC recipients are not supported. The addon blocks sending and shows a notification if any BCC recipients are present when encryption is enabled.

After sending, the addon stores the unencrypted MIME in a "PostGuard Sent" folder so the sender can read their own messages later.

## Email Decryption Flow

The decryption flow extracts ciphertext from a received email, delegates decryption to the popup, and replaces the encrypted message with the decrypted one.

1. Extract ciphertext from attachments or HTML body using `extractCiphertext()` (standalone import)
2. Open the crypto popup, which decrypts and returns plaintext + sender identity
3. Inject threading headers and an `X-PostGuard` marker into the decrypted MIME
4. Import the decrypted message back into the folder and delete the encrypted original

```ts
import { extractCiphertext, injectMimeHeaders } from "@e4a/pg-js";

// Extract ciphertext using standalone SDK helper
const ciphertext = extractCiphertext({
  htmlBody: htmlBody ?? undefined,
  attachments: attData,
});

if (!ciphertext) {
  return { ok: false, error: "decryptionError" };
}

// Delegate decryption to popup
const result = await openCryptoPopup({
  operation: "decrypt",
  config: { pkgUrl: PKG_URL!, cryptifyUrl: CRYPTIFY_URL, headers: PG_CLIENT_HEADER },
  ciphertextBase64: toBase64(ciphertext),
  recipientEmail: myAddresses[0],
}) as DecryptPopupResult;

const plaintext = new TextDecoder().decode(fromBase64(result.plaintextBase64));

// Inject threading headers and X-PostGuard marker
let markedPlaintext = plaintext;
if (Object.keys(threadingHeaders).length > 0) {
  markedPlaintext = injectMimeHeaders(markedPlaintext, threadingHeaders, threadingRemove);
}
markedPlaintext = injectMimeHeaders(markedPlaintext, { "X-PostGuard": "decrypted" });

// Import decrypted message into the original folder
const file = new File([markedPlaintext], "decrypted.eml", { type: "text/plain" });
const importedMsg = await browser.messages.import(file, msg.folder.id);
```

<small>[Source: background.ts#L661-L722](https://github.com/encryption4all/postguard-tb-addon/blob/57234eebd32d64bd011086fe89ecdd7ac40fc15d/src/background/background.ts#L661-L722)</small>

## Detecting PostGuard Emails

```ts
async function isPGEncrypted(msgId: number): Promise<boolean> {
  const attachments = await browser.messages.listAttachments(msgId);
  if (attachments.some((att) => att.name === "postguard.encrypted")) return true;

  try {
    const full = await browser.messages.getFull(msgId);
    const bodyHtml = findHtmlBody(full);
    if (bodyHtml && bodyHtml.includes("-----BEGIN POSTGUARD MESSAGE-----")) return true;
  } catch {
    // ignore
  }

  return false;
}
```

<small>[Source: background.ts#L226-L240](https://github.com/encryption4all/postguard-tb-addon/blob/57234eebd32d64bd011086fe89ecdd7ac40fc15d/src/background/background.ts#L226-L240)</small>

## Bundling

The SDK inlines its WASM binary as base64 at build time, so no WASM loader plugins or file copying is needed. The addon bundles with esbuild and the WASM is included in the JS output automatically.

The background script only needs MIME building and ciphertext extraction. These are pure functions that don't require a PostGuard instance:

```ts
import { buildMime, extractCiphertext, injectMimeHeaders } from "@e4a/pg-js";
```

The full PostGuard class (with WASM, crypto, and Yivi) is only instantiated in the popup where it is needed. The `@e4a/pg-js` bundle (including inlined WASM) is around 2 MB. Since the crypto popup is the only entry point that imports `PostGuard`, this cost is isolated to the popup bundle.

Your extension manifest must allow WASM execution:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
}
```

The Yivi client uses `EventSource` for server-sent events. In Thunderbird, `EventSource` is not available in extension pages. The SDK disables SSE and uses polling by default, so no polyfill is needed. If you use the Yivi packages directly, you may need to shim the `EventSource` import in your bundler config.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Thunderbird](https://www.thunderbird.net/) 128+

### Setup

```bash
npm install
cp .env.example .env   # adjust if needed
```

### Build and Run

```bash
npm run build          # production build, output in dist/
npm run build:dev      # development build (no minification, preserves console.log)
npm run watch          # dev build with file watching
```

To load the extension in Thunderbird: open **Add-ons Manager** > **gear icon** > **Debug Add-ons** > **Load Temporary Add-on**, then select any file inside the `dist/` folder.

## Releasing

The version must be updated in three files before releasing:

1. `package.json` (`"version"`)
2. `manifest.json` (`"version"`)
3. `updates.json` (add a new entry with the new version)

Then commit, push, and tag:

```bash
git add package.json manifest.json updates.json
git commit -m "Bump version to X.Y.Z"
git push origin main
git tag vX.Y.Z && git push origin vX.Y.Z
```

Pushing a `v*` tag triggers the CI pipeline which builds the `.xpi` file and creates a GitHub release.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `build.yml` | Tag push (`v*`) | Validates version consistency, builds, packages `.xpi`, creates GitHub release |
