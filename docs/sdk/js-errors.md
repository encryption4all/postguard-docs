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

## `DecryptionError`

Thrown when decryption fails for a non-identity reason.

Thrown when:
- Neither `element` nor `session` is provided for decryption
- Multiple recipients exist but no `recipient` parameter was given
- The ciphertext is malformed or corrupted

## `IdentityMismatchError`

A subclass of `DecryptionError`. Thrown when the Yivi attributes proven by the user do not match the encryption policy embedded in the ciphertext. For example, the message was encrypted for `alice@example.com` but the user proved `bob@example.com`.

## Usage example

The SvelteKit download page handles decryption errors:

```ts
try {
  const opened = pg.open({ uuid });
  const decrypted = await opened.decrypt({
    element: '#yivi-web',
    recipient: recipientParam || undefined
  });

  result = decrypted as DecryptFileResult;
  senderEmail = result.sender?.email ?? '';
  dlState = 'done';
  result.download();
} catch (e) {
  if (e instanceof IdentityMismatchError) {
    dlState = 'identity-mismatch';
  } else {
    errorMessage = e instanceof Error ? e.message : String(e);
    dlState = 'error';
  }
}
```

<small>[Source: +page.svelte#L44-L63](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/routes/download/+page.svelte#L44-L63)</small>

::: tip
Always check for the most specific error first (`IdentityMismatchError`) and work up to the most general (`PostGuardError`), since they form an inheritance chain.
:::
