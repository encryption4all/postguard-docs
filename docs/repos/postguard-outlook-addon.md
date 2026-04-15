# postguard-outlook-addon

[GitHub](https://github.com/encryption4all/postguard-outlook-addon) · TypeScript · Outlook Add-in

Identity-based email encryption add-in for Microsoft Outlook. Built as an Office Web Add-in using Office.js, PostGuard WASM, and Yivi authentication.

## How It Works

The add-in runs inside Outlook's web add-in framework. It uses the Office JavaScript API to access email content, encrypts/decrypts using PostGuard's WASM module, and authenticates via Yivi. The core encryption and decryption logic is the same as the [Thunderbird addon](/repos/postguard-tb-addon). Only the UI plumbing and extension APIs differ.

## Architecture

The Outlook add-in uses Office JS APIs instead of WebExtension APIs:

- **Manifest**: XML-based (`manifest.xml`) instead of `manifest.json`
- **Taskpane**: decryption UI shown in a side panel when reading encrypted messages
- **Compose pane**: encryption toggle and policy editor
- **Dialog**: `Office.context.ui.displayDialogAsync()` opens Yivi popup windows, with `messageParent()` to return JWTs back to the calling code
- **Event handlers**: `OnMessageSend` for encryption, `OnMessageRead` for auto-decryption
- **State**: `sessionStorage` for compose state (encryption toggle, policies, signing identity)

### Yivi Dialog

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

The SDK inlines its WASM as base64 at build time, so no separate WASM loader is needed.

## Development

### Prerequisites

- Node.js 20+
- Microsoft Outlook (desktop or web)

### Setup

```bash
npm install
```

### Build and Run

```bash
npm run dev-server    # Webpack dev server (port 3000)
npm run build         # production build
npm run build:dev     # development build
npm run watch         # watch mode
```

The dev server runs on port 3000. To sideload the add-in in Outlook, follow [Microsoft's sideloading instructions](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/test-debug-office-add-ins).

### Configuration

The add-in configuration is in `package.json`:

- `config.app_to_debug`: `outlook`
- `config.dev_server_port`: `3000`

## Releasing

This add-in does not currently have automated releases. To release:

1. Update the version in `package.json`
2. Run `npm run build` to create the production bundle
3. Deploy using Office add-in deployment tools (admin center or sideload)
