# Email Addon Integration

This guide explains how to build an email addon (Thunderbird, Outlook, or similar) using the PostGuard SDK. Email addons run in extension environments where DOM-based Yivi rendering is handled in separate popup windows.

Both the [Thunderbird addon](https://github.com/encryption4all/postguard-tb-addon) and the [Outlook addon](https://github.com/encryption4all/postguard-outlook-addon) follow the patterns described here. All code snippets below come directly from those repositories.

## Architecture

An email addon typically has three components:

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

## Popup-Owns-Crypto Pattern

The background script cannot render DOM elements, and the Yivi QR code needs a visible HTML element. The Thunderbird addon solves this by opening a popup window that creates its own `PostGuard` instance, runs the full encrypt or decrypt flow, and sends the result back.

### Opening the popup (background script)

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

### Popup initialization

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

### Encrypt handler (popup)

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

### Decrypt handler (popup)

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

The background script intercepts the compose send event, builds the MIME, and delegates encryption to the popup. The key steps are:

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

### BCC limitation

PostGuard does not support BCC recipients. The Thunderbird addon blocks sending and shows a notification if any BCC recipients are present when encryption is enabled.

### Sent copy management

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

Check if a message is PostGuard-encrypted by looking for the attachment or armored payload marker:

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

## Outlook-Specific Notes

The Outlook addon uses the Office JS API instead of WebExtension APIs:

- Manifest: XML-based (`manifest.xml`) instead of `manifest.json`
- Taskpane: decryption UI shown in a side panel when reading encrypted messages
- Compose pane: encryption toggle and policy editor
- Dialog: `Office.context.ui.displayDialogAsync()` for Yivi popups, with `messageParent()` to return JWTs
- Event handlers: `OnMessageSend` for encryption, `OnMessageRead` for auto-decryption
- State: `sessionStorage` for compose state (encryption toggle, policies, signing identity)

The core encryption/decryption logic is the same. Only the UI plumbing and extension APIs differ.

### Yivi dialog (Outlook)

The Outlook addon opens a dialog for Yivi sessions using `Office.context.ui.displayDialogAsync()`:

```ts
async function openYiviDialogForSigning(con: AttributeCon): Promise<string> {
  const dialogData = {
    hostname: PKG_URL,
    header: PG_CLIENT_HEADER,
    con,
    sort: "Signing",
    validity: secondsTill4AM(),
  };

  const encodedData = encodeURIComponent(JSON.stringify(dialogData));
  const dialogUrl = `${window.location.origin}/dialog.html?data=${encodedData}`;

  return new Promise<string>((resolve, reject) => {
    Office.context.ui.displayDialogAsync(
      dialogUrl,
      { height: 60, width: 40, promptBeforeOpen: false },
      (asyncResult) => {
        if (asyncResult.status !== Office.AsyncResultStatus.Succeeded) {
          reject(new Error("Failed to open signing dialog"));
          return;
        }
        const dialog = asyncResult.value;

        dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg: { message: string }) => {
          dialog.close();
          try {
            const message = JSON.parse(arg.message);
            if (message.jwt) resolve(message.jwt);
            else reject(new Error(message.error || "No JWT"));
          } catch {
            reject(new Error("Invalid dialog response"));
          }
        });

        dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
          reject(new Error("Dialog was closed"));
        });
      }
    );
  });
}
```

<small>[Source: commands.ts#L149-L189](https://github.com/encryption4all/postguard-outlook-addon/blob/dd0073b568a94524e2658dd44e2851d2dccfac82/src/commands/commands.ts#L149-L189)</small>

## Bundling Considerations

### WASM handling

The SDK inlines its WASM binary as base64 at build time. No WASM loader plugins or file copying is needed. The addon bundles with esbuild, and the WASM is included in the JS output automatically.

For web applications using Vite, you can use `vite-plugin-wasm` and `vite-plugin-top-level-await` instead. These resolve `.wasm` imports as separate files served by the dev server or bundled as static assets. Both approaches produce the same result at runtime; the base64 inlining just avoids the need for separate file serving, which is important in extension contexts.

### Standalone email helpers

The background script only needs MIME building and ciphertext extraction. These are pure functions that don't require a PostGuard instance:

```ts
import { buildMime, extractCiphertext, injectMimeHeaders } from "@e4a/pg-js";
```

The full PostGuard class (with WASM, crypto, and Yivi) is only instantiated in the popup where it is needed.

### Content Security Policy

Your extension manifest must allow WASM execution. For Manifest V3:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
}
```

### EventSource polyfill

The Yivi client uses `EventSource` for server-sent events. In Thunderbird, `EventSource` is not available in extension pages. The SDK disables SSE and uses polling by default, so no polyfill is needed. If you use the Yivi packages directly, you may need to shim the `EventSource` import in your bundler config.

### File size

The `@e4a/pg-js` bundle (including inlined WASM) is around 2 MB. Since the crypto popup is the only entry point that imports `PostGuard`, this cost is isolated to the popup bundle. The background script imports only the standalone email helpers, which add minimal size.
