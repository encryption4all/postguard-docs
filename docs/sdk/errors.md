# Error Handling

The SDK exports a hierarchy of error classes. All errors extend `PostGuardError`, which itself extends the native `Error`.

## Error Hierarchy

```
Error
  └── PostGuardError
        ├── NetworkError
        ├── YiviNotInstalledError
        └── DecryptionError
              └── IdentityMismatchError
```

## `PostGuardError`

The base class for all SDK errors.

```ts
import { PostGuardError } from '@e4a/pg-js'

try {
  await pg.encrypt({ ... })
} catch (err) {
  if (err instanceof PostGuardError) {
    console.error('PostGuard error:', err.message)
  }
}
```

Thrown when: general SDK errors that do not fit a more specific category.

## `NetworkError`

Thrown when an HTTP request to the PKG or Cryptify server fails.

```ts
import { NetworkError } from '@e4a/pg-js'

try {
  await pg.encryptAndUpload({ ... })
} catch (err) {
  if (err instanceof NetworkError) {
    console.error(`HTTP ${err.status}: ${err.body}`)
  }
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `message` | `string` | Human-readable error description |
| `status` | `number` | HTTP status code |
| `body` | `string` | Response body from the server |

Thrown when:
- The PKG server is unreachable or returns an error
- The Cryptify server rejects an upload or download
- Any backend HTTP request fails with a non-2xx status

### Common status codes

| Status | Meaning | Action |
|--------|---------|--------|
| `401` | Invalid API key or expired session | Check credentials |
| `403` | Forbidden | Verify permissions |
| `404` | Resource not found (e.g. invalid UUID) | Check the UUID |
| `429` | Rate limited | Back off and retry |
| `500` | Server error | Retry later |

## `YiviNotInstalledError`

Thrown when `pg.sign.yivi()` or `decrypt({ element })` is used but the required Yivi packages are not installed. The SDK attempts to dynamically import `@privacybydesign/yivi-core`, `@privacybydesign/yivi-client`, and `@privacybydesign/yivi-web`. If any import fails, this error is thrown.

```ts
import { YiviNotInstalledError } from '@e4a/pg-js'

try {
  await pg.encrypt({
    sign: pg.sign.yivi({ element: '#qr', senderEmail: 'me@example.com' }),
    ...
  })
} catch (err) {
  if (err instanceof YiviNotInstalledError) {
    console.error(err.message)
    // "Install @privacybydesign/yivi-core, @privacybydesign/yivi-client,
    //  and @privacybydesign/yivi-web to use Yivi features."
  }
}
```

Fix: install the Yivi packages:

```sh
npm install @privacybydesign/yivi-core @privacybydesign/yivi-client @privacybydesign/yivi-web
```

Or use `pg.sign.session()` or `pg.sign.apiKey()` instead.

## `DecryptionError`

Thrown when decryption fails for a non-identity reason.

```ts
import { DecryptionError } from '@e4a/pg-js'

try {
  await pg.decrypt({ data: ciphertext })
} catch (err) {
  if (err instanceof DecryptionError) {
    console.error('Decryption failed:', err.message)
  }
}
```

Thrown when:
- Neither `element` nor `session` is provided for decryption
- Multiple recipients exist but no `recipient` parameter was given
- The ciphertext is malformed or corrupted

### Multiple recipients

When the ciphertext was encrypted for multiple recipients and no `recipient` is specified:

```ts
try {
  await pg.decrypt({ data: ciphertext, element: '#yivi' })
} catch (err) {
  if (err instanceof DecryptionError) {
    // "Multiple recipients found. Please specify one of: alice@example.com, bob@example.com"
  }
}
```

## `IdentityMismatchError`

A subclass of `DecryptionError`. Thrown when the Yivi attributes proven by the user do not match the encryption policy embedded in the ciphertext. For example, the message was encrypted for `alice@example.com` but the user proved `bob@example.com`.

```ts
import { IdentityMismatchError } from '@e4a/pg-js'

try {
  await pg.decrypt({ uuid: '...', element: '#yivi' })
} catch (err) {
  if (err instanceof IdentityMismatchError) {
    alert('You are not the intended recipient of this message.')
  }
}
```

## Recommended Pattern

A full error handling pattern that covers all cases:

```ts
import {
  PostGuardError,
  NetworkError,
  YiviNotInstalledError,
  DecryptionError,
  IdentityMismatchError,
} from '@e4a/pg-js'

try {
  const result = await pg.decrypt({
    data: ciphertext,
    element: '#yivi',
    recipient: userEmail,
  })
  showDecryptedContent(result)
} catch (err) {
  if (err instanceof IdentityMismatchError) {
    showError('Your identity does not match the recipient. '
      + 'Make sure you are using the correct email address.')
  } else if (err instanceof DecryptionError) {
    showError(`Decryption failed: ${err.message}`)
  } else if (err instanceof YiviNotInstalledError) {
    showError('Yivi packages are not installed. '
      + 'Please install @privacybydesign/yivi-core and related packages.')
  } else if (err instanceof NetworkError) {
    if (err.status === 404) {
      showError('The encrypted file was not found. It may have been deleted.')
    } else {
      showError(`Server error (${err.status}). Please try again later.`)
    }
  } else if (err instanceof PostGuardError) {
    showError(`Unexpected error: ${err.message}`)
  } else {
    throw err // Re-throw non-PostGuard errors
  }
}
```

::: tip
Always check for the most specific error first (`IdentityMismatchError`) and work up to the most general (`PostGuardError`), since they form an inheritance chain.
:::
