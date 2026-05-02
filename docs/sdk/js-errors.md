# Error Handling

The SDK exports a hierarchy of error classes. All errors extend `PostGuardError`, which itself extends the native `Error`.

## Error Hierarchy

```
Error
  └── PostGuardError
        ├── NetworkError
        ├── YiviNotInstalledError
        ├── YiviSessionError
        └── DecryptionError
              └── IdentityMismatchError
```

## `PostGuardError`

The base class for all SDK errors.

Thrown when: general SDK errors that do not fit a more specific category.

## `NetworkError`

Thrown when an HTTP request to the PKG or Cryptify server fails.

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

Thrown when `pg.sign.yivi()` or `opened.decrypt({ element })` is used but the required Yivi packages are not installed. The SDK attempts to dynamically import `@privacybydesign/yivi-core`, `@privacybydesign/yivi-client`, and `@privacybydesign/yivi-web`. If any import fails, this error is thrown.

The Yivi packages are transitive dependencies of the SDK. If you see this error, check that `npm install` completed without errors and that the packages are in your `node_modules`.

## `YiviSessionError`

Thrown when a Yivi session ends in any non-success final state. The user dismissed the QR widget, declined disclosure in the Yivi app, or the session timed out. Before this error existed, the same condition surfaced as a primitive string rejection that broke the usual `err instanceof Error` check.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `message` | `string` | `Yivi session ended without disclosure: <reason>` |
| `reason` | `string` | Raw yivi-core final-state name: `'Cancelled'`, `'TimedOut'`, `'Aborted'`, ... |
| `cancelled` | `boolean` | Convenience getter equal to `reason === 'Cancelled'` |

```ts
import { YiviSessionError } from '@e4a/pg-js';

try {
  await pg.encrypt({ ... }).upload();
} catch (e) {
  if (e instanceof YiviSessionError) {
    if (e.cancelled) {
      // user dismissed the QR widget
    } else {
      // e.reason is 'TimedOut', 'Aborted', or another non-success state
    }
    return;
  }
  throw e;
}
```

<small>[Source: errors.ts#L48-L59](https://github.com/encryption4all/postguard-js/blob/2e2e0442a23b9f821a2bca008fe270af6c487e30/src/errors.ts#L48-L59)</small>

Thrown when:
- The user closes or dismisses the Yivi QR widget
- The user declines disclosure in the Yivi app
- The Yivi session times out
- The Yivi session is aborted for any other non-success reason

Affects both `pg.encrypt(...).upload()` and `pg.encrypt(...).toBytes()` when `pg.sign.yivi(...)` is used, and `pg.open(...).decrypt(...)` when a Yivi session backs the decryption.

## `DecryptionError`

Thrown when decryption fails for a non-identity reason.

Thrown when:
- Neither `element` nor `session` is provided for decryption
- Multiple recipients exist but no `recipient` parameter was given
- The ciphertext is malformed or corrupted

## `IdentityMismatchError`

A subclass of `DecryptionError`. Thrown when the Yivi attributes proven by the user do not match the encryption policy embedded in the ciphertext. For example, the message was encrypted for `alice@example.com` but the user proved `bob@example.com`.

## Handling order

::: tip
Always check for the most specific error first (`IdentityMismatchError`) and work up to the most general (`PostGuardError`), since they form an inheritance chain.
:::

In a `try`/`catch` around `opened.decrypt()`, branch on `IdentityMismatchError` first (to show a "wrong recipient" message), then on `YiviSessionError` (to show a friendly "session cancelled" message instead of a generic failure), then fall through to a generic error branch that reads `e.message` for anything else.
