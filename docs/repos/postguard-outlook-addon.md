# postguard-outlook-addon

[GitHub](https://github.com/encryption4all/postguard-outlook-addon) · TypeScript · Outlook Add-in

Identity-based email encryption add-in for Microsoft Outlook. Built as an Office Web Add-in using Office.js, PostGuard WASM, and Yivi authentication. Targets new Outlook on Windows (WebView2), Outlook on the web, and Outlook on macOS (taskpane flow only), Mailbox 1.12+. The one-click OnSend flow runs on Windows and the web; Outlook for Mac native uses the taskpane "Encrypt & Send" button instead. See the per-platform matrix below.

## How It Works

The add-in runs inside Outlook's web add-in framework. It uses the Office JavaScript API to access email content, encrypts and decrypts using PostGuard's WASM module, and authenticates via Yivi. The core encryption and decryption logic is the same as the [Thunderbird addon](/repos/postguard-tb-addon). Only the UI plumbing and extension APIs differ.

## Architecture

The Outlook add-in uses Office JS APIs instead of WebExtension APIs:

- Manifest: XML-based (`manifest.xml`) instead of `manifest.json`.
- Taskpane: read-mode decryption UI (`src/taskpane/read-view.ts`) and compose-mode policy editor (`src/taskpane/compose-view.ts`, `src/taskpane/policy-editor.ts`). The taskpane shell (`src/taskpane/taskpane.ts`) routes between views.
- Yivi dialog: a separate page (`src/yivi-dialog/yivi-dialog.{ts,html}`) hosted at `yivi-dialog.html`. It runs pg-js plus the Yivi QR widget in its own WebView2 window so encryption can happen during the Send pipeline, where the taskpane is not available.
- Launchevent runtime: `src/launchevent/launchevent.ts` registers two events. `OnNewMessageCompose` fires when a new compose, reply, or forward opens — it seeds the per-draft `x-pg-encrypt-on-send` header from the mailbox-wide default and paints the persistent in-message banner. `OnMessageSend` reads only that header to decide whether to open the Yivi dialog with `displayDialogAsync`, write the encrypted result back into the outgoing item, and release Send. On `Office.context.platform === Office.PlatformType.Mac` the send handler exits early with a Smart Alert pointing the user at the taskpane "Encrypt & Send" button; `displayDialogAsync` from a launchevent runtime is broken on Outlook for Mac native (OfficeDev/office-js #3138, #3085, #5681).
- Settings view: `src/taskpane/settings-view.ts` (taskpane gear icon, top-right). Exposes the mailbox-wide encryption default, the optimistic-dialog opt-in, and Yivi sign-attribute prefills. All values are written to `roamingSettings` so the launchevent runtime can read them too.
- Shared helpers under `src/lib/`: `office-helpers.ts` (Office.js wrappers including the notification banner helpers), `settings.ts` (typed roaming-settings keys shared by taskpane and launchevent), `mime.ts` (MIME assembly and parsing), `graph-client.ts` (Graph API for fetching the full sent item), `pkg-client.ts` (PKG endpoints and host config), `auth.ts` (PKG bearer JWT exchange), `i18n.ts`, `encoding.ts`, `attributes.ts`, `storage.ts`, `types.ts`, and `dialog-chunk.ts` (chunked `messageChild` / `messageParent` protocol).

### Encryption defaults and per-draft control

PostGuard is opt-in. New drafts default to unencrypted, and the user opts in either from the compose toggle or from the Settings view.

Two roaming settings and one internet header carry the state across the taskpane and the launchevent runtime:

- `pg.encryptionEnabled` (default `false`) — mailbox-wide default. Settings view writes it; `OnNewMessageCompose` reads it once per draft to seed the header below. Changing this only affects future drafts.
- `x-pg-encrypt-on-send` (`"true"` / `"false"`) — per-draft header on the compose item. The compose toggle writes this header; `OnMessageSend` reads only this header at send time. A draft the user explicitly toggled keeps its choice even if the global default changes later.
- Persistent compose banner — `OnNewMessageCompose` paints a notification message on the draft that reads "PostGuard is on…" or "PostGuard is off — this message will be sent unencrypted." It is updated in place by the compose toggle, so the user always sees the current state of this specific draft without opening the taskpane.

The send handler is fail-closed once the header is read as `"true"` and fail-open otherwise:

- Header reads `"true"` → a `committedToEncrypt` latch flips. Any subsequent failure (encrypt error, the ~4½-minute Smart Alert timeout, an unhandled exception in the async callback) blocks the send with a Smart Alert. PostGuard never silently sends a "supposed to be encrypted" email in cleartext.
- Header reads `"false"`, is absent, or cannot be read → release Send immediately. A PostGuard outage cannot block an unencrypted send.

### Settings view

The taskpane has a gear icon (top-right) that opens a Settings view backed by `roamingSettings`. Two toggles and three prefill fields:

- *Encrypt new messages by default* — writes `pg.encryptionEnabled`.
- *Skip the "open a dialog" confirmation* — writes `pg.allowOptimisticDialog`. Off by default. Enabling it lets the launchevent try to open the Yivi dialog directly; if that attempt is blocked (Safari without site-level popup permission, for example), the handler retries once with the prompt so the send is not lost.
- Sign-attribute prefills for `fullname`, `dateofbirth`, and `mobilenumber`. Filled values are sent to Yivi as mandatory disclosures; blank values are sent as `optional: true` so the user can disclose them in the Yivi app or skip.

### Per-platform behaviour

The OnSend flow is not uniform across Outlook clients. The launchevent handler picks a path based on `Office.context.platform`, the browser, and the `pg.allowOptimisticDialog` setting, after [postguard-outlook-addon#29](https://github.com/encryption4all/postguard-outlook-addon/pull/29) and [postguard-outlook-addon#63](https://github.com/encryption4all/postguard-outlook-addon/pull/63):

| Client | Behaviour |
|---|---|
| Outlook for Mac (native) | OnSend is blocked with a Smart Alert pointing at the taskpane "Encrypt & Send" button. `displayDialogAsync` from a launchevent runtime does not work there (OfficeDev/office-js #3138, #3085, #5681). |
| Outlook on Windows / on the web (default) | Office shows a "PostGuard wants to open a dialog → Allow" prompt, the user clicks Allow, the Yivi dialog opens. Works reliably on every host including Safari without site-level popup permission, because the Allow click is itself the user gesture that opens the popup. |
| Outlook on Windows / on the web (`pg.allowOptimisticDialog` on) | One-click send. The handler attempts an optimistic open with `promptBeforeOpen: false`. If the host blocks it (Safari without site-level popup permission), the handler retries once with `promptBeforeOpen: true` so the send still goes through after Allow. |

The repo's own [`docs/outlook-quirks.md`](https://github.com/encryption4all/postguard-outlook-addon/blob/master/docs/outlook-quirks.md) carries the longer-form notes on each case.

### Yivi dialog and the Send flow

The OnMessageSend handler opens `yivi-dialog.html` with `Office.context.ui.displayDialogAsync`. The handler and the dialog talk over `messageChild` and `messageParent`, but each frame is capped at about 32KB, so payloads are split with the chunking helper in `src/lib/dialog-chunk.ts`. The dialog announces `ready`, the handler streams the encrypt request, the dialog runs Yivi plus pg-js and posts back `encrypt-result` (or `encrypt-error` / `cancelled`).

The default open path uses `promptBeforeOpen: true` so the user's click on the Office Allow confirmation is itself the fresh user gesture that opens the popup. The `pg.allowOptimisticDialog` Settings toggle flips this to an optimistic open with a single prompted retry on failure:

```ts
  const allowOptimistic = getAllowOptimisticDialog();
  log(`displayDialogAsync: promptBeforeOpen=${!allowOptimistic} (optimistic=${allowOptimistic})`);
  let dialog: Office.Dialog;
  try {
    dialog = await openDialogAsync(YIVI_DIALOG_URL, {
      ...baseOptions,
      promptBeforeOpen: !allowOptimistic,
    });
    log(allowOptimistic ? "dialog opened (no prompt)" : "dialog opened (after prompt)");
  } catch (e) {
    if (!allowOptimistic) throw e;
    const msg = (e as { message?: string })?.message ?? String(e);
    log(`optimistic attempt failed (${msg}); retrying with promptBeforeOpen=true`);
    dialog = await openDialogAsync(YIVI_DIALOG_URL, {
      ...baseOptions,
      promptBeforeOpen: true,
    });
    log("dialog opened (after prompt fallback)");
  }
```

<small>[Source: launchevent.ts#L298-L316](https://github.com/encryption4all/postguard-outlook-addon/blob/2fcc56ec4fc7ec34bb557a4d5de2b3d317d636fa/src/launchevent/launchevent.ts#L298-L316)</small>

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
```

<small>[Source: launchevent.ts#L340-L356](https://github.com/encryption4all/postguard-outlook-addon/blob/2fcc56ec4fc7ec34bb557a4d5de2b3d317d636fa/src/launchevent/launchevent.ts#L340-L356)</small>

The taskpane Yivi flow (compose-mode policy signing, read-mode decryption) is different: there the Yivi QR widget runs inline in the taskpane DOM at `#yivi-web-form` rather than in a popup, because the taskpane is already a long-lived web context.

The pg-js SDK inlines its WASM as base64 at build time, so no separate WASM loader is needed.

### Known quirks

The repo keeps a running log of Office.js and Outlook surprises in [`docs/outlook-quirks.md`](https://github.com/encryption4all/postguard-outlook-addon/blob/master/docs/outlook-quirks.md), covering manifest validator gotchas, OnMessageSend probing, dialog sizing in CSS pixels, and platform-specific WebView2 behavior. Read it before changing manifest, launchevent, or dialog code.

## Development

### Prerequisites

- Node.js 20+
- Microsoft Outlook (new Outlook on Windows, Outlook on the web, or Outlook on macOS)

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
