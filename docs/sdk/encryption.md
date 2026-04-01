# Encryption

The SDK provides three encryption methods, each suited to a different use case.

| Method | Upload | Email delivery | Returns |
|--------|--------|----------------|---------|
| `encrypt()` | No | No | `Uint8Array` |
| `encryptAndUpload()` | Yes | No | `{ uuid }` |
| `encryptAndDeliver()` | Yes | Yes | `{ uuid }` |

## Recipients

Before encrypting, build one or more recipients:

```ts
// Encrypt for a specific email address
const alice = pg.recipient.email('alice@example.com')

// Encrypt for anyone at a domain (organisation-level)
const org = pg.recipient.emailDomain('bob@company.nl')

// Encrypt with custom attribute requirements
const custom = pg.recipient.withPolicy('carol@example.com', [
  { t: 'pbdf.sidn-pbdf.email.email', v: 'carol@example.com' },
  { t: 'pbdf.gemeente.personalData.fullname', v: 'Carol Smith' },
])
```

You can pass multiple recipients to any encryption method. Each recipient gets their own decryption policy embedded in the ciphertext.

## `encrypt()`

Encrypts raw data and returns the ciphertext as a `Uint8Array`. No files are uploaded to Cryptify.

```ts
const plaintext = new TextEncoder().encode('Confidential message')

const ciphertext = await pg.encrypt({
  sign: pg.sign.apiKey('your-api-key'),
  recipients: [
    pg.recipient.email('alice@example.com'),
  ],
  data: plaintext,
})
```

### Streaming input

You can also pass a `ReadableStream<Uint8Array>` as `data` for large payloads:

```ts
const stream = file.stream() // ReadableStream from a File object

const ciphertext = await pg.encrypt({
  sign: pg.sign.apiKey('your-api-key'),
  recipients: [pg.recipient.email('alice@example.com')],
  data: stream,
})
```

### Use cases

- Email encryption (encrypt the inner MIME, then wrap in an envelope)
- Encrypting data in memory without external storage
- Custom storage backends

## `encryptAndUpload()`

Encrypts one or more files and uploads them to Cryptify. Returns a UUID that recipients can use to download and decrypt.

::: warning
Requires `cryptifyUrl` to be set in the constructor.
:::

```ts
const result = await pg.encryptAndUpload({
  sign: pg.sign.yivi({
    element: '#yivi-qr',
    senderEmail: 'sender@example.com',
  }),
  recipients: [
    pg.recipient.email('alice@example.com'),
    pg.recipient.email('bob@example.com'),
  ],
  files: document.getElementById('fileInput').files, // FileList
  onProgress: (percentage) => {
    progressBar.style.width = `${percentage}%`
  },
  signal: abortController.signal, // optional AbortSignal
})

console.log('Share this UUID:', result.uuid)
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `sign` | `SignMethod` | Authentication method |
| `recipients` | `Recipient[]` | One or more recipients |
| `files` | `File[] \| FileList` | Files to encrypt |
| `onProgress` | `(pct: number) => void` | Upload progress callback (0-100) |
| `signal` | `AbortSignal` | Cancel the operation |

## `encryptAndDeliver()`

Same as `encryptAndUpload`, but also triggers Cryptify to send email notifications to all recipients with a link to decrypt.

```ts
const result = await pg.encryptAndDeliver({
  sign: pg.sign.apiKey('your-api-key'),
  recipients: [
    pg.recipient.email('alice@example.com'),
  ],
  files: [myFile],
  delivery: {
    message: 'Please find the encrypted documents attached.',
    language: 'EN',        // 'EN' or 'NL'
    confirmToSender: true, // send a copy to the sender
  },
})
```

### Delivery options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `message` | `string` | `undefined` | Custom message in the notification email |
| `language` | `'EN' \| 'NL'` | `'EN'` | Language of the notification email |
| `confirmToSender` | `boolean` | `false` | Send a delivery confirmation to the sender |

## Including the sender

When using Yivi authentication, you can include the sender as a recipient so they can also decrypt the files later:

```ts
const result = await pg.encryptAndUpload({
  sign: pg.sign.yivi({
    element: '#yivi-qr',
    senderEmail: 'sender@example.com',
    includeSender: true, // sender can also decrypt
  }),
  recipients: [pg.recipient.email('alice@example.com')],
  files: myFiles,
})
```

## Error handling

All encryption methods can throw:

- **`PostGuardError`** -- general SDK error
- **`NetworkError`** -- PKG or Cryptify communication failure
- **`YiviNotInstalledError`** -- Yivi packages not installed (when using `pg.sign.yivi`)

```ts
import { NetworkError, YiviNotInstalledError } from '@e4a/pg-js'

try {
  await pg.encryptAndUpload({ ... })
} catch (err) {
  if (err instanceof NetworkError) {
    console.error(`Server error ${err.status}: ${err.body}`)
  } else if (err instanceof YiviNotInstalledError) {
    console.error('Please install the Yivi packages')
  }
}
```

See [Error Handling](/sdk/errors) for the full error reference.
