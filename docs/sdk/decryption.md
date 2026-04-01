# Decryption

The SDK provides a single `decrypt()` method that handles two distinct flows based on the input:

| Input | Decrypts from | Returns |
|-------|---------------|---------|
| `{ uuid }` | Cryptify stored file | `DecryptFileResult` |
| `{ data }` | Raw ciphertext bytes | `DecryptDataResult` |

Both flows require the recipient to prove their identity through Yivi. You provide either an `element` (for browser-based Yivi QR) or a `session` callback (for custom flows).

## Decrypt from Cryptify UUID

Downloads and decrypts a file stored on Cryptify. The result contains the decrypted files as a ZIP blob.

::: warning
Requires `cryptifyUrl` to be set in the constructor.
:::

### Using Yivi Web (browser)

```ts
const result = await pg.decrypt({
  uuid: 'abc123-def456-...',
  element: '#yivi-container',
})

// result: DecryptFileResult
console.log('Files:', result.files)       // ['document.pdf', 'photo.jpg']
console.log('Sender:', result.sender)     // { public: { con: [...] } }

// Trigger browser download
result.download('my-files.zip')
```

### Using a session callback

```ts
const result = await pg.decrypt({
  uuid: 'abc123-def456-...',
  session: async (request) => {
    // request.con  -- required attributes
    // request.sort -- 'Decryption'
    // request.hints -- optional display hints
    const jwt = await myYiviHandler(request)
    return jwt
  },
  recipient: 'alice@example.com',
})
```

### `DecryptFileResult`

```ts
interface DecryptFileResult {
  files: string[]                    // filenames inside the ZIP
  sender: SenderIdentity | null      // verified sender identity
  blob: Blob                         // the decrypted ZIP blob
  download: (filename?: string) => void  // trigger browser download
}
```

## Decrypt from Raw Data

Decrypts raw ciphertext bytes (e.g. from an encrypted email). Returns the plaintext bytes and sender identity.

### Using Yivi Web (browser)

```ts
const result = await pg.decrypt({
  data: ciphertext,        // Uint8Array
  element: '#yivi-container',
  recipient: 'alice@example.com',
})

// result: DecryptDataResult
const text = new TextDecoder().decode(result.plaintext)
console.log('Decrypted:', text)
console.log('Sender:', result.sender)
```

### Using a session callback

This is the pattern used by email addons (Thunderbird, Outlook) where the Yivi session is handled in a separate popup window:

```ts
const result = await pg.decrypt({
  data: ciphertext,
  session: async (request) => {
    // request.con   -- attributes the recipient must prove
    // request.sort  -- 'Decryption'
    // request.hints -- display hints (e.g. which email to prove)

    // Open a popup, run the Yivi session, return the JWT
    const jwt = await openYiviPopup(request)
    return jwt
  },
  recipient: 'alice@example.com',
})

const plaintext = new TextDecoder().decode(result.plaintext)
```

### `DecryptDataResult`

```ts
interface DecryptDataResult {
  plaintext: Uint8Array          // the decrypted data
  sender: SenderIdentity | null  // verified sender identity
}
```

### Streaming input

The `data` parameter accepts both `Uint8Array` and `ReadableStream<Uint8Array>`:

```ts
const result = await pg.decrypt({
  data: readableStream,
  element: '#yivi-container',
})
```

## Recipient Selection

When the ciphertext was encrypted for multiple recipients, the SDK needs to know which recipient key to use. There are three scenarios:

**Single recipient** -- no `recipient` parameter needed. The SDK picks the only available key.

```ts
await pg.decrypt({ uuid: '...', element: '#yivi' })
```

**Multiple recipients, known email** -- pass the `recipient` parameter:

```ts
await pg.decrypt({
  uuid: '...',
  element: '#yivi',
  recipient: 'alice@example.com',
})
```

**Multiple recipients, no match** -- the SDK throws a `DecryptionError` listing the available keys:

```ts
import { DecryptionError } from '@e4a/pg-js'

try {
  await pg.decrypt({ data: ciphertext, element: '#yivi' })
} catch (err) {
  if (err instanceof DecryptionError) {
    // "Multiple recipients found. Please specify one of: alice@example.com, bob@example.com"
    console.error(err.message)
  }
}
```

## Sender Identity

Both result types include a `sender` field with the verified identity of the person who encrypted the data:

```ts
interface SenderIdentity {
  public: {
    con: { t: string; v?: string }[]   // publicly visible attributes
  }
  private?: {
    con: { t: string; v?: string }[]   // attributes only visible to recipients
  }
}
```

Example:

```ts
const result = await pg.decrypt({ uuid: '...', element: '#yivi' })

if (result.sender) {
  const emailAttr = result.sender.public.con.find(
    (a) => a.t === 'pbdf.sidn-pbdf.email.email'
  )
  console.log('Sent by:', emailAttr?.v)
}
```

## Cancellation

Pass an `AbortSignal` to cancel an in-progress decryption:

```ts
const controller = new AbortController()

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30_000)

const result = await pg.decrypt({
  uuid: '...',
  element: '#yivi',
  signal: controller.signal,
})
```

## Error Handling

Decryption can throw:

- **`DecryptionError`** -- general decryption failure, or missing `element`/`session`
- **`IdentityMismatchError`** -- the Yivi attributes did not match the encryption policy
- **`NetworkError`** -- PKG or Cryptify communication failure

```ts
import { IdentityMismatchError, DecryptionError } from '@e4a/pg-js'

try {
  await pg.decrypt({ data: ciphertext, element: '#yivi' })
} catch (err) {
  if (err instanceof IdentityMismatchError) {
    alert('Your identity does not match. Are you the intended recipient?')
  } else if (err instanceof DecryptionError) {
    console.error('Decryption failed:', err.message)
  }
}
```

See [Error Handling](/sdk/errors) for the full error reference.
