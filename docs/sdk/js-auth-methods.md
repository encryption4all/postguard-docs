# Authentication Methods

PostGuard requires the sender to prove their identity before encrypting. The SDK supports three authentication methods, each suited to a different environment.

## Comparison

| Method | Environment | Interactive |
|--------|-------------|-------------|
| `pg.sign.apiKey()` | Server-side, trusted clients | No |
| `pg.sign.yivi()` | Browser apps | Yes (QR code) |
| `pg.sign.session()` | Extensions, custom flows | Depends on callback |

## API Key

Uses a pre-shared API key (prefixed with `PG-`) to authenticate with the PKG. Keys are issued by the [postguard-business](/repos/postguard-business) portal. Suitable for server-side applications or trusted client environments where you don't need interactive identity verification.

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

The PostGuard website uses Yivi signing with optional extra attributes and sender encryption:

```ts
const sign = pg.sign.yivi({
  element: '#crypt-irma-qr',
  attributes: [
    { t: 'pbdf.gemeente.personalData.fullname', optional: true },
    { t: 'pbdf.sidn-pbdf.mobilenumber.mobilenumber', optional: true },
    { t: 'pbdf.gemeente.personalData.dateofbirth', optional: true },
  ],
  includeSender: true,
});
```

The sender's email is always requested automatically. Attributes marked `optional: true` are presented to the user as optional disclosures: the user can choose to skip them during the Yivi session. Non-optional attributes must be disclosed for the session to succeed.

When `includeSender` is `true`, the sender's identity is added to the encryption policy so the sender can also decrypt their own message.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `element` | `string` | Yes | CSS selector for the QR code container |
| `senderEmail` | `string` | No | The sender's email address to prove |
| `attributes` | `Array<{ t, v?, optional? }>` | No | Extra attributes to request (e.g. name, phone). Email is always included automatically. |
| `includeSender` | `boolean` | No | Also encrypt for the sender so they can decrypt their own message (default: `false`) |

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

<small>[Source: background.ts#L372-L379](https://github.com/encryption4all/postguard-tb-addon/blob/26b8433efc8997bc1fe614f532caf17fb94b4a70/src/background/background.ts#L372-L379)</small>

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

<small>[Source: background.ts#L710-L721](https://github.com/encryption4all/postguard-tb-addon/blob/26b8433efc8997bc1fe614f532caf17fb94b4a70/src/background/background.ts#L710-L721)</small>

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

See the [Thunderbird addon](/repos/postguard-tb-addon) and [Outlook addon](/repos/postguard-outlook-addon) pages for the full patterns.

## Decryption Authentication

Decryption also requires identity verification. The same `element` and `session` patterns apply. You must provide either `element` or `session` when calling `opened.decrypt()`. If neither is provided, the SDK throws a `DecryptionError`.

Pass `enableCache: true` to cache the Yivi JWT across multiple `decrypt()` calls. This avoids forcing the user to scan a QR code for every message when decrypting a batch. See [Decryption: JWT caching](/sdk/js-decryption#jwt-caching) for details.
