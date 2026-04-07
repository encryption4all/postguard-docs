# Encryption

The SDK provides three encryption methods, each suited to a different use case.

| Method | Upload | Email delivery | Returns |
|--------|--------|----------------|---------|
| `encrypt()` | No | No | `Uint8Array` |
| `encryptAndUpload()` | Yes | No | `{ uuid }` |
| `encryptAndDeliver()` | Yes | Yes | `{ uuid }` |

## Recipients

Before encrypting, build one or more recipients. PostGuard can encrypt with any wallet attribute. Email is the most common, but you can also target recipients by name, BSN, domain, or any other verified attribute.

The SvelteKit example uses `pg.recipient.email()` and `pg.recipient.emailDomain()`:

<<< @/snippets/postguard-examples/pg-sveltekit/src/lib/postguard/encryption.ts{20-31 ts}

The Thunderbird addon builds recipients with custom policies when configured:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{362-376 ts}

Under the hood, `pg.recipient.email()` creates a policy with the attribute type `pbdf.sidn-pbdf.email.email`, while `pg.recipient.emailDomain()` extracts the domain from the email and uses `pbdf.sidn-pbdf.email.domain`.

## `encrypt()`

Encrypts raw data and returns the ciphertext as a `Uint8Array`. No files are uploaded. The Thunderbird addon uses this to encrypt MIME email content:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{388-396 ts}

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sign` | `SignMethod` | Yes | Authentication method |
| `recipients` | `Recipient[]` | Yes | One or more recipients |
| `data` | `Uint8Array \| ReadableStream<Uint8Array>` | Yes | Data to encrypt |

## `encryptAndUpload()`

Encrypts one or more files and uploads them to Cryptify. The files are bundled into a ZIP archive, encrypted, and streamed to Cryptify in chunks (1 MB by default). Returns a UUID that recipients can use to download and decrypt.

::: warning
Requires `cryptifyUrl` to be set in the constructor.
:::

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sign` | `SignMethod` | Yes | Authentication method |
| `recipients` | `Recipient[]` | Yes | One or more recipients |
| `files` | `File[] \| FileList` | Yes | Files to encrypt |
| `onProgress` | `(pct: number) => void` | No | Upload progress callback (0-100) |
| `signal` | `AbortSignal` | No | Cancel the operation |

## `encryptAndDeliver()`

Same as `encryptAndUpload`, but also triggers Cryptify to send email notifications to all recipients with a link to decrypt. The SvelteKit example uses this with an API key:

<<< @/snippets/postguard-examples/pg-sveltekit/src/lib/postguard/encryption.ts{50-87 ts}

### Delivery options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `message` | `string` | `undefined` | Custom message in the notification email |
| `language` | `'EN' \| 'NL'` | `'EN'` | Language of the notification email |
| `confirmToSender` | `boolean` | `false` | Send a delivery confirmation to the sender |

## Error handling

All encryption methods can throw:

- `PostGuardError`: general SDK error
- `NetworkError`: PKG or Cryptify communication failure (includes `status` and `body` properties)
- `YiviNotInstalledError`: Yivi packages not installed (when using `pg.sign.yivi`)

See [Error Handling](/sdk/errors) for the full error reference.
