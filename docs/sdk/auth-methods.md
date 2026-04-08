# Authentication Methods

PostGuard requires the sender to prove their identity before encrypting. The SDK supports three authentication methods, each suited to a different environment.

## Comparison

| Method | Environment | Interactive |
|--------|-------------|-------------|
| `pg.sign.apiKey()` | Server-side, trusted clients | No |
| `pg.sign.yivi()` | Browser apps | Yes (QR code) |
| `pg.sign.session()` | Extensions, custom flows | Depends on callback |

## API Key

Uses a pre-shared API key (prefixed with `PG-API-`) to authenticate with the PKG. Suitable for server-side applications or trusted client environments where you don't need interactive identity verification.

The SvelteKit example uses an API key for encryption:

```ts
const sealed = pg.encrypt({
  files,
  recipients: [
    pg.recipient.email(citizen.email),
    pg.recipient.emailDomain(organisation.email)
  ],
  sign: pg.sign.apiKey(apiKey),
  onProgress,
  signal: abortController?.signal
});

const result = await sealed.upload({
  notify: { message: message ?? undefined, language: 'EN' }
});
```

<small>[Source: encryption.ts#L26-L43](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/lib/postguard/encryption.ts#L26-L43)</small>

The SDK sends the API key as a `Bearer` token in the `Authorization` header when requesting signing keys from the PKG at `POST /v2/irma/sign/key`.

::: info
API keys are part of PostGuard for Business. Contact your PKG administrator to obtain one.
:::

## Yivi Web

Runs an interactive Yivi session directly in the browser. The SDK renders a QR code (or app link on mobile) in the specified DOM element. The user scans it with the Yivi app to prove their email address.

The SvelteKit download page uses `element` for Yivi-based decryption:

```ts
const opened = pg.open({ uuid });
const decrypted = await opened.decrypt({
  element: '#yivi-web',
  recipient: recipientParam || undefined
});
```

<small>[Source: +page.svelte#L47-L51](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/routes/download/+page.svelte#L47-L51)</small>

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `element` | `string` | Yes | CSS selector for the QR code container |
| `senderEmail` | `string` | Yes | The sender's email address to prove |
| `includeSender` | `boolean` | No | Also encrypt for the sender (default: `false`) |

## Session Callback

The most flexible method. You provide a callback function that receives a session request and must return a JWT string. This lets you handle the Yivi session yourself: in a popup window, a separate process, or any custom flow.

The Thunderbird addon uses this for both encryption and decryption. For encryption, the session callback opens a Yivi popup:

```ts
const sealed = pg!.encrypt({
  sign: pg!.sign.session(
    async ({ con, sort }) => createYiviPopup(con as AttributeCon, sort as KeySort),
    { senderEmail: from }
  ),
  recipients: pgRecipients,
  data: mimeData,
});
```

<small>[Source: background.ts#L372-L379](https://github.com/encryption4all/postguard-tb-addon/blob/feat/implement-sdk/src/background/background.ts#L372-L379)</small>

For decryption, the same pattern with a session callback:

```ts
const opened = pg.open({ data: ciphertext });
const result = await opened.decrypt({
  recipient: myAddresses[0],
  session: async ({ con, sort, hints, senderId }) => {
    return createYiviPopup(
      con as AttributeCon,
      sort as KeySort,
      hints as AttributeCon | undefined,
      senderId
    );
  },
}) as DecryptDataResult;
```

<small>[Source: background.ts#L710-L721](https://github.com/encryption4all/postguard-tb-addon/blob/feat/implement-sdk/src/background/background.ts#L710-L721)</small>

### The callback receives

| Property | Type | Description |
|----------|------|-------------|
| `con` | `Array<{ t, v? }>` | Attribute constraints the user must prove |
| `sort` | `'Signing' \| 'Decryption'` | Whether this is for signing or decryption |
| `hints` | `Array<{ t, v? }>` | Optional hints (e.g. expected recipient email) |
| `senderId` | `string` | Optional sender identifier |

The callback must return a JWT string from a completed Yivi session.

### Outlook dialog pattern

The Outlook addon uses `Office.context.ui.displayDialogAsync()` instead of `browser.windows.create()`:

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

See the [Email Addon Integration](/integrations/email-addon) guide for the full patterns.

## Decryption Authentication

Decryption also requires identity verification. The same `element` and `session` patterns apply. You must provide either `element` or `session` when calling `opened.decrypt()`. If neither is provided, the SDK throws a `DecryptionError`.
