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
  notify: {
    recipients: true,
    message: message ?? undefined,
    language: 'EN'
  }
});
```

<small>[Source: encryption.ts#L24-L44](https://github.com/encryption4all/postguard-examples/blob/3d06342fad2c749ca4d043070d1ad9c831c7bfc1/pg-sveltekit/src/lib/postguard/encryption.ts#L24-L44)</small>

The SDK sends the API key as a `Bearer` token in the `Authorization` header when requesting signing keys from the PKG at `POST /v2/irma/sign/key`.

::: info
API keys are part of PostGuard for Business. Contact your PKG administrator to obtain one.
:::

## Yivi Web

Runs an interactive Yivi session directly in the browser. The SDK renders a QR code (or app link on mobile) in the specified DOM element. The user scans it with the Yivi app to prove their email address.

For decryption in a browser, pass `element` to `opened.decrypt()` with a CSS selector for the Yivi QR container. See [Decryption](/sdk/js-decryption) for the full call shape.

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
| `attributes` | `AttrConItem[]` | No | Extra attributes to request. Each entry is either a single attribute (`AttrReq`) or a disjunction (`AttrDiscon`). Email is always included automatically. |
| `includeSender` | `boolean` | No | Also encrypt for the sender so they can decrypt their own message (default: `false`) |

### Attribute disjunctions

By default each entry in `attributes` is a single attribute object (`AttrReq`). When you need to accept the same piece of information from multiple credential types (for example, a name that can come from a municipality credential, a passport, an ID card, or a driving licence), you can pass an `AttrDiscon` instead: a nested array where each inner array is one acceptable conjunction of attributes (an AND), and the outer array is the list of alternatives (an OR).

```ts
type AttrReq    = { t: string; v?: string; optional?: boolean }
type AttrDiscon = AttrReq[][]   // OR of ANDs
type AttrConItem = AttrReq | AttrDiscon
```

Narrow the union at runtime with `Array.isArray(item)`: `true` → `AttrDiscon`, `false` → `AttrReq`.

#### Optional disjunctions

To make a disjunction optional, add an empty array `[]` as the first alternative. Yivi treats an empty conjunction as always-satisfiable, making the whole discon skippable.

#### Example: optional name from any government ID

This requests the sender's name, but accepts any of four credential types and makes the whole group optional. If the sender does not have any of the listed credentials loaded in Yivi, they can skip the disclosure entirely.

```ts
const sign = pg.sign.yivi({
  element: '#crypt-irma-qr',
  attributes: [
    // Optional name — sender can satisfy with any one of the four alternatives,
    // or skip entirely (the empty [] alternative is always satisfiable).
    [
      [],                                                        // skip (optional)
      [{ t: 'pbdf.gemeente.personalData.fullname' }],           // OR: municipality full name
      [{ t: 'pbdf.pbdf.passport.firstName' },
       { t: 'pbdf.pbdf.passport.lastName' }],                   // OR: passport first + last
      [{ t: 'pbdf.pbdf.idcard.firstName' },
       { t: 'pbdf.pbdf.idcard.lastName' }],                     // OR: ID card first + last
      [{ t: 'pbdf.pbdf.drivinglicence.firstName' },
       { t: 'pbdf.pbdf.drivinglicence.lastName' }],             // OR: driving licence first + last
    ],
    // Other optional attributes can still be flat AttrReq entries.
    { t: 'pbdf.sidn-pbdf.mobilenumber.mobilenumber', optional: true },
    { t: 'pbdf.gemeente.personalData.dateofbirth', optional: true },
  ],
  includeSender: true,
});
```

The Yivi app presents the name group as a single step. The user picks whichever credential they have loaded; if they have none, they skip. The remainder of the `attributes` array (phone, date of birth) is presented as separate optional steps.

#### Mandatory disjunction

Remove the empty `[]` alternative to make the disclosure required. The Yivi session will not complete until the sender proves their name from one of the listed credentials:

```ts
[
  [{ t: 'pbdf.gemeente.personalData.fullname' }],
  [{ t: 'pbdf.pbdf.passport.firstName' }, { t: 'pbdf.pbdf.passport.lastName' }],
  [{ t: 'pbdf.pbdf.idcard.firstName' },   { t: 'pbdf.pbdf.idcard.lastName' }],
  [{ t: 'pbdf.pbdf.drivinglicence.firstName' }, { t: 'pbdf.pbdf.drivinglicence.lastName' }],
]
```

::: info PKG requirement
Attribute disjunctions require `@e4a/pg-js` ≥ 1.11.0 and a PKG running `postguard` with condiscon support. Earlier PKG versions only accept a flat `con` array.
:::

#### How it maps to the PKG wire format

The `attributes` array is forwarded verbatim as the `con` field in the `POST /v2/request/start` body. Single `AttrReq` objects serialise as `{"t":"..."}` objects; `AttrDiscon` entries serialise as nested arrays, exactly the shape the PKG's `ConItem` untagged enum expects:

```json
{
  "con": [
    { "t": "pbdf.sidn-pbdf.email.email" },
    [
      [],
      [{ "t": "pbdf.gemeente.personalData.fullname" }],
      [{ "t": "pbdf.pbdf.passport.firstName" }, { "t": "pbdf.pbdf.passport.lastName" }],
      [{ "t": "pbdf.pbdf.idcard.firstName" },   { "t": "pbdf.pbdf.idcard.lastName" }],
      [{ "t": "pbdf.pbdf.drivinglicence.firstName" }, { "t": "pbdf.pbdf.drivinglicence.lastName" }]
    ],
    { "t": "pbdf.sidn-pbdf.mobilenumber.mobilenumber", "optional": true },
    { "t": "pbdf.gemeente.personalData.dateofbirth", "optional": true }
  ]
}
```

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
