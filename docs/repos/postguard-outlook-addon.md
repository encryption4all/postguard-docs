# postguard-outlook-addon

[GitHub](https://github.com/encryption4all/postguard-outlook-addon) · TypeScript · Outlook Add-in

Identity-based email encryption add-in for Microsoft Outlook. Built as an Office Web Add-in using Office.js, PostGuard WASM, and Yivi authentication.

## How It Works

The add-in runs inside Outlook's web add-in framework. It uses the Office JavaScript API to access email content, encrypts/decrypts using PostGuard's WASM module, and authenticates via Yivi. The architecture is similar to the [Thunderbird addon](/repos/postguard-tb-addon) but adapted for the Outlook add-in model.

For technical details on the encryption and decryption flows, see the [Email Addon Integration](/integrations/email-addon) page.

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
