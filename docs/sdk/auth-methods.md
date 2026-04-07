# Authentication Methods

PostGuard requires the sender to prove their identity before encrypting. The SDK supports three authentication methods, each suited to a different environment.

## Comparison

| Method | Environment | Yivi packages needed | Interactive |
|--------|-------------|---------------------|-------------|
| `pg.sign.apiKey()` | Server-side, trusted clients | No | No |
| `pg.sign.yivi()` | Browser apps | Yes | Yes (QR code) |
| `pg.sign.session()` | Extensions, custom flows | No | Depends on callback |

## API Key

Uses a pre-shared API key (prefixed with `PG-API-`) to authenticate with the PKG. Suitable for server-side applications or trusted client environments where you don't need interactive identity verification.

The SvelteKit example uses an API key for encryption:

<<< @/snippets/postguard-examples/pg-sveltekit/src/lib/postguard/encryption.ts{17-32 ts}

The SDK sends the API key as a `Bearer` token in the `Authorization` header when requesting signing keys from the PKG at `POST /v2/irma/sign/key`.

::: info
API keys are part of PostGuard for Business. Contact your PKG administrator to obtain one.
:::

## Yivi Web

Runs an interactive Yivi session directly in the browser. The SDK renders a QR code (or app link on mobile) in the specified DOM element. The user scans it with the Yivi app to prove their email address.

The SvelteKit download page uses the `element` parameter for Yivi-based decryption:

<<< @/snippets/postguard-examples/pg-sveltekit/src/routes/download/+page.svelte{44-49 ts}

### Requirements

The Yivi web packages must be installed:

```sh
npm install @privacybydesign/yivi-core @privacybydesign/yivi-client @privacybydesign/yivi-web
```

If they are not installed, the SDK throws a `YiviNotInstalledError` when you try to use this method.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `element` | `string` | Yes | CSS selector for the QR code container |
| `senderEmail` | `string` | Yes | The sender's email address to prove |
| `includeSender` | `boolean` | No | Also encrypt for the sender (default: `false`) |

## Session Callback

The most flexible method. You provide a callback function that receives a session request and must return a JWT string. This lets you handle the Yivi session yourself: in a popup window, a separate process, or any custom flow.

The Thunderbird addon uses this for both encryption and decryption. For encryption, the session callback opens a Yivi popup:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{388-396 ts}

For decryption:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{727-738 ts}

The `createYiviPopup` function opens a browser popup and resolves with the JWT when the Yivi session completes:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{608-658 ts}

### The popup page

The popup uses the SDK's `runYiviSession()` utility to handle the full Yivi flow:

<<< @/snippets/postguard-tb-addon/src/pages/yivi-popup/yivi-popup.ts{56-96 ts}

### Outlook dialog pattern

The Outlook addon uses `Office.context.ui.displayDialogAsync()` instead of `browser.windows.create()`:

<<< @/snippets/postguard-outlook-addon/src/commands/commands.ts{149-189 ts}

See the [Email Addon Integration](/integrations/email-addon) guide for the full patterns.

## Decryption Authentication

Decryption also requires identity verification. The same `element` and `session` patterns apply. You must provide either `element` or `session` for decryption. If neither is provided, the SDK throws a `DecryptionError`.
