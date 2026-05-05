# postguard-outlook-addon

[GitHub](https://github.com/encryption4all/postguard-outlook-addon) · TypeScript · Outlook Add-in

Identity-based email encryption add-in for Microsoft Outlook. Built as an Office Web Add-in using Office.js, PostGuard WASM, and Yivi authentication. Targets new Outlook on Windows (WebView2) and Outlook on macOS, Mailbox 1.12+.

## How It Works

The add-in runs inside Outlook's web add-in framework. It uses the Office JavaScript API to access email content, encrypts and decrypts using PostGuard's WASM module, and authenticates via Yivi. The core encryption and decryption logic is the same as the [Thunderbird addon](/repos/postguard-tb-addon). Only the UI plumbing and extension APIs differ.

## Architecture

The Outlook add-in uses Office JS APIs instead of WebExtension APIs:

- Manifest: XML-based (`manifest.xml`) instead of `manifest.json`.
- Taskpane: read-mode decryption UI (`src/taskpane/read-view.ts`) and compose-mode policy editor (`src/taskpane/compose-view.ts`, `src/taskpane/policy-editor.ts`). The taskpane shell (`src/taskpane/taskpane.ts`) routes between views.
- Yivi dialog: a separate page (`src/yivi-dialog/yivi-dialog.{ts,html}`) hosted at `yivi-dialog.html`. It runs pg-js plus the Yivi QR widget in its own WebView2 window so encryption can happen during the Send pipeline, where the taskpane is not available.
- Smart Alerts handler: `src/launchevent/launchevent.ts` registers the `OnMessageSend` event. It collects the message body and attachments, opens the Yivi dialog with `displayDialogAsync`, and writes the encrypted result back into the outgoing item before releasing Send.
- Event handlers: `OnMessageSend` for one-click encryption. Read-mode auto-decryption runs from the taskpane when an encrypted message is opened.
- Shared helpers under `src/lib/`: `office-helpers.ts` (Office.js wrappers), `mime.ts` (MIME assembly and parsing), `graph-client.ts` (Graph API for fetching the full sent item), `pkg-client.ts` (PKG endpoints and host config), `auth.ts` (PKG bearer JWT exchange), `i18n.ts`, `encoding.ts`, `attributes.ts`, `storage.ts`, `types.ts`, and `dialog-chunk.ts` (chunked `messageChild` / `messageParent` protocol).

### Yivi dialog and the Send flow

The OnMessageSend handler opens `yivi-dialog.html` with `Office.context.ui.displayDialogAsync`. The handler and the dialog talk over `messageChild` and `messageParent`, but each frame is capped at about 32KB, so payloads are split with the chunking helper in `src/lib/dialog-chunk.ts`. The dialog announces `ready`, the handler streams the encrypt request, the dialog runs Yivi plus pg-js and posts back `encrypt-result` (or `encrypt-error` / `cancelled`).

```ts
    Office.context.ui.displayDialogAsync(
      YIVI_DIALOG_URL,
      // promptBeforeOpen: false suppresses the "PostGuard is opening
      // another window" confirmation. Honored because the dialog URL is
      // on the same origin as the add-in's source location. Requires
      // Mailbox 1.9 (we require 1.12 in VersionOverridesV1_1).
      { height: heightPct, width: widthPct, displayInIframe: false, promptBeforeOpen: false },
      (asyncResult) => {
        log(`displayDialogAsync status=${asyncResult.status}`);
        if (asyncResult.status !== Office.AsyncResultStatus.Succeeded) {
          reject(new Error(`displayDialogAsync failed: ${asyncResult.error?.message}`));
          return;
        }
        const dialog = asyncResult.value;
        const inbound = new ChunkAssembler();
```

<small>[Source: launchevent.ts#L253-L267](https://github.com/encryption4all/postguard-outlook-addon/blob/f602030dafe2f958dabf7bacbf6239c8c65e291b/src/launchevent/launchevent.ts#L253-L267)</small>

The dispatch loop drives the message protocol:

```ts
        const dispatch = (body: DialogMessage): void => {
          log(`dialog → handler: ${body.type}`);
          switch (body.type) {
            case "ready": {
              const chunks = chunkPayload(payload);
              log(`sending ${chunks.length} chunk(s) to dialog`);
              for (const c of chunks) {
                dialog.messageChild(JSON.stringify(c));
              }
              break;
            }
            case "encrypt-result":
              settle(() => {
                closeDialog();
                resolve(body as unknown as EncryptResult);
              });
              break;
            case "encrypt-error":
              settle(() => {
                closeDialog();
                reject(new Error(String(body.message ?? "Encryption failed")));
              });
              break;
            case "cancelled":
              settle(() => reject(new Error("Cancelled in dialog")));
              break;
```

<small>[Source: launchevent.ts#L288-L313](https://github.com/encryption4all/postguard-outlook-addon/blob/f602030dafe2f958dabf7bacbf6239c8c65e291b/src/launchevent/launchevent.ts#L288-L313)</small>

The taskpane Yivi flow (compose-mode policy signing, read-mode decryption) is different: there the Yivi QR widget runs inline in the taskpane DOM at `#yivi-web-form` rather than in a popup, because the taskpane is already a long-lived web context.

The pg-js SDK inlines its WASM as base64 at build time, so no separate WASM loader is needed.

### Known quirks

The repo keeps a running log of Office.js and Outlook surprises in [`docs/outlook-quirks.md`](https://github.com/encryption4all/postguard-outlook-addon/blob/master/docs/outlook-quirks.md), covering manifest validator gotchas, OnMessageSend probing, dialog sizing in CSS pixels, and platform-specific WebView2 behavior. Read it before changing manifest, launchevent, or dialog code.

## Development

### Prerequisites

- Node.js 20+
- Microsoft Outlook (new Outlook on Windows, or Outlook on macOS)

### Setup

```bash
npm install
```

### Build and Run

```bash
npm run dev-server    # webpack dev server (port 3000)
npm run build         # production build
npm run build:dev     # development build
npm run watch         # watch mode
npm run start         # office-addin-debugging start manifest.xml
npm run stop          # office-addin-debugging stop manifest.xml
npm run validate      # office-addin-manifest validate manifest.xml
```

The dev server runs on port 3000. To sideload the add-in, follow [Microsoft's sideloading instructions](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/test-debug-office-add-ins).

### Configuration

The add-in configuration is in `package.json`:

- `config.app_to_debug`: `outlook`
- `config.app_type_to_debug`: `desktop`
- `config.dev_server_port`: `3000`

Production hosts and PKG / Cryptify URLs are baked in at Docker build time via the `ADDIN_PUBLIC_URL`, `PKG_URL`, `CRYPTIFY_URL`, and `POSTGUARD_WEBSITE_URL` build args (see `.github/workflows/release.yml`).

## Releasing

Releases run on every push to `master` via `.github/workflows/release.yml`:

1. `googleapis/release-please-action` watches conventional commits and opens a release PR. Merging that PR cuts a tagged release.
2. On non-release pushes, CI builds and pushes `ghcr.io/encryption4all/postguard-outlook-addon:edge` (and a `sha-<commit>` tag) using staging hosts.
3. On release pushes, CI builds the same image with production hosts and tags it with the released version.

The image is an NGINX container serving the built add-in over HTTPS. To deploy, pull the new tag and restart the container on the host serving `addin.postguard.eu` (or `addin.staging.postguard.eu` for `:edge`). There is no automatic deploy step in CI today.

The Office add-in store submission and admin-center deployment still happen out of band against the published manifest.
