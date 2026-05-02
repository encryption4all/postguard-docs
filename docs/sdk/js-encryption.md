# Encryption

`pg.encrypt()` returns a `Sealed` builder. The builder captures encryption parameters but does no work until you call a terminal method.

## Terminal methods

| Method | What it does | Returns |
|--------|--------------|---------|
| `sealed.toBytes()` | Encrypt and buffer in memory | `Promise<Uint8Array>` |
| `sealed.upload()` | Encrypt and stream to Cryptify (silent — no Cryptify-sent emails) | `Promise<{ uuid }>` |
| `sealed.upload({ notify })` | Same, plus opt-in Cryptify-sent emails | `Promise<{ uuid }>` |

## Recipients

Before encrypting, build one or more recipients. PostGuard can encrypt with any wallet attribute. Email is the most common, but you can also target recipients by domain or custom attributes.

The SvelteKit example encrypts for a citizen (exact email) and an organisation (email domain):

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
```

<small>[Source: encryption.ts#L27-L33](https://github.com/encryption4all/postguard-examples/blob/3d06342fad2c749ca4d043070d1ad9c831c7bfc1/pg-sveltekit/src/lib/postguard/encryption.ts#L27-L33)</small>

Under the hood, `pg.recipient.email()` creates a policy with the attribute type `pbdf.sidn-pbdf.email.email`, while `pg.recipient.emailDomain()` extracts the domain from the email and uses `pbdf.sidn-pbdf.email.domain`.

Both methods return a `RecipientBuilder` that supports fluent chaining with `.extraAttribute()` to require additional attributes beyond the base email or domain:

```ts
pg.recipient.email('alice@example.com')
  .extraAttribute('pbdf.gemeente.personalData.surname', 'Smith')
  .extraAttribute('pbdf.sidn-pbdf.mobilenumber.mobilenumber', '0612345678')
```

## Encrypt and upload

Encrypts files, bundles them into a ZIP, and streams the encrypted data to Cryptify. Returns a UUID that recipients use to download and decrypt.

```ts
const sealed = pg.encrypt({
  files,
  recipients: [pg.recipient.email(citizen.email), pg.recipient.emailDomain(organisation.email)],
  sign: pg.sign.apiKey(apiKey),
  onProgress,
  signal: abortController?.signal
});

// Silent upload — no Cryptify-sent emails. Returns UUID for custom delivery.
const { uuid } = await sealed.upload();

// Or opt into Cryptify-sent emails. `recipients: true` emails each
// recipient with a download link; `sender: true` adds a confirmation
// back to the sender. Both default false.
const { uuid } = await sealed.upload({
  notify: {
    recipients: true,
    sender: false,
    message: 'Here are your files',
    language: 'EN'
  }
});
```

<small>[Source: encryption.ts#L24-L60](https://github.com/encryption4all/postguard-examples/blob/3d06342fad2c749ca4d043070d1ad9c831c7bfc1/pg-sveltekit/src/lib/postguard/encryption.ts#L24-L60)</small>

::: warning
Requires `cryptifyUrl` to be set in the constructor.
:::

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files` | `File[] \| FileList` | Yes* | Files to encrypt (zipped automatically) |
| `data` | `Uint8Array \| ReadableStream` | Yes* | Raw data to encrypt (no zipping) |
| `sign` | `SignMethod` | Yes | Authentication method |
| `recipients` | `Recipient[]` | Yes | One or more recipients |
| `onProgress` | `(pct: number) => void` | No | Upload progress callback (0-100) |
| `signal` | `AbortSignal` | No | Cancel the operation |

*Provide either `files` or `data`, not both.

### Notify options

The upload is silent by default — both recipient and sender mails are opt-in. Pass `notify` to enable either or both.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `recipients` | `boolean` | `false` | Send a download-link email to each recipient |
| `sender` | `boolean` | `false` | Send a delivery confirmation to the sender |
| `message` | `string` | `undefined` | Optional unencrypted text included in any mail sent |
| `language` | `'EN' \| 'NL'` | `'EN'` | Notification email template language |

## Encrypt raw data

For email addons, use `data` instead of `files`. The Thunderbird addon's crypto popup encrypts the full MIME message (body + attachments) as raw bytes, then wraps it in an email envelope:

```ts
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
```

<small>[Source: yivi-popup.ts#L90-L136](https://github.com/encryption4all/postguard-tb-addon/blob/26b8433efc8997bc1fe614f532caf17fb94b4a70/src/pages/yivi-popup/yivi-popup.ts#L90-L136)</small>

Call `.toBytes()` to get the encrypted data, or pass the `Sealed` object directly to `pg.email.createEnvelope()` for email integration.

## Error handling

All encryption methods can throw:

- `PostGuardError`: general SDK error
- `NetworkError`: PKG or Cryptify communication failure (includes `status` and `body` properties)
- `YiviNotInstalledError`: Yivi packages not installed (when using `pg.sign.yivi`)
- `YiviSessionError`: the Yivi disclosure session ended without success (cancelled, timed out, aborted) — only when using `pg.sign.yivi`

When the sender uses `pg.sign.yivi(...)`, distinguish a cancelled disclosure from a real failure by checking `YiviSessionError` first:

```ts
import { YiviSessionError } from '@e4a/pg-js';

try {
  const { uuid } = await pg.encrypt({
    files,
    recipients,
    sign: pg.sign.yivi({ element: '#yivi-web-form', senderEmail }),
  }).upload();
} catch (e) {
  if (e instanceof YiviSessionError) {
    showMessage(e.cancelled ? 'Sign-in cancelled.' : `Sign-in failed: ${e.reason}.`);
    return;
  }
  throw e;
}
```

See [Error Handling](/sdk/js-errors) for the full error reference.
