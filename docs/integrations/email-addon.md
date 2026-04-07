# Email Addon Integration

This guide explains how to build an email addon (Thunderbird, Outlook, or similar) using the PostGuard SDK. Email addons run in extension environments where DOM-based Yivi rendering is handled in separate popup windows, and dynamic imports may not work as expected.

Both the [Thunderbird addon](https://github.com/encryption4all/postguard-tb-addon) and the [Outlook addon](https://github.com/encryption4all/postguard-outlook-addon) follow the patterns described here. All code snippets below come directly from those repositories.

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

Browser extensions often cannot use dynamic `import()` for WASM modules. The Thunderbird addon loads WASM at startup and passes it to the constructor:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{65-206 ts}

### Caching PKG keys

The Thunderbird addon caches the Master Public Key in `browser.storage.local` for offline resilience. If the PKG is unreachable, the cached key is used as a fallback:

<<< @/snippets/postguard-tb-addon/src/lib/pkg-client.ts

## The Session Callback Pattern

Since the background script cannot render DOM elements, `pg.sign.session()` opens a popup, waits for the Yivi session to complete, and returns the JWT.

### Popup bridge (background script)

The background script tracks pending popups in a Map and resolves the Promise when the popup sends back a JWT:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{56-63 ts}

<<< @/snippets/postguard-tb-addon/src/background/background.ts{608-677 ts}

### Message handler

The background script routes `yiviPopupInit` and `yiviPopupDone` messages from the popup:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{126-132 ts}

### Yivi popup page

The popup uses the SDK's `runYiviSession()` utility to handle the full Yivi flow, then sends the JWT back to the background:

<<< @/snippets/postguard-tb-addon/src/pages/yivi-popup/yivi-popup.ts

## Email Encryption Flow

With the session callback in place, the encryption flow intercepts the compose send event. This is the full `handleBeforeSend` handler from the Thunderbird addon:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{284-431 ts}

The key steps are:
1. Build attachments list from the compose tab
2. Fetch threading headers if replying
3. Build the inner MIME using `pg.email.buildMime()`
4. Build recipients (with custom policies if configured)
5. Encrypt with `pg.encrypt()` using a session callback that opens the Yivi popup
6. Create the encrypted envelope with `pg.email.createEnvelope()`
7. Replace the email body and subject with the envelope contents

### BCC limitation

PostGuard does not support BCC recipients. The Thunderbird addon blocks sending if any BCC recipients are present when encryption is enabled.

### Sent copy management

After sending, the addon stores the unencrypted MIME in a "PostGuard Sent" folder so the sender can read their own messages later:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{143-169 ts}

## Email Decryption Flow

<<< @/snippets/postguard-tb-addon/src/background/background.ts{680-806 ts}

The key steps are:
1. Extract ciphertext from attachments or HTML body using `pg.email.extractCiphertext()`
2. Decrypt with `pg.decrypt()` using a session callback
3. Build sender identity badges from the result
4. Inject threading headers and an `X-PostGuard` marker into the decrypted MIME
5. Import the decrypted message back into the folder and delete the encrypted original

## Detecting PostGuard Emails

Check if a message is PostGuard-encrypted by looking for the attachment or armored payload:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{249-265 ts}

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

<<< @/snippets/postguard-outlook-addon/src/commands/commands.ts{149-189 ts}

The dialog receives data via URL parameters and sends the JWT back with `Office.context.ui.messageParent()`:

<<< @/snippets/postguard-outlook-addon/src/dialog/dialog.ts{50-137 ts}

## Bundling Considerations

Email extension environments have specific bundling requirements:

- WASM loading: use the `wasm` constructor option with a pre-loaded module. Copy the WASM binary to your extension's output directory during build.
- Dynamic imports: avoid where possible. Use static imports or extension-compatible loading patterns.
- Content Security Policy: your extension manifest must allow WASM execution (`'wasm-unsafe-eval'` in Manifest V3).
- File size: the `@e4a/pg-wasm` module is around 2 MB. Load it eagerly at startup rather than on first use.
- EventSource polyfill: the Yivi client uses `EventSource` for server-sent events. In Thunderbird, you may need to shim this.
