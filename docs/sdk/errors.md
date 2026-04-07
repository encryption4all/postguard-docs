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

Thrown when `pg.sign.yivi()` or `decrypt({ element })` is used but the required Yivi packages are not installed. The SDK attempts to dynamically import `@privacybydesign/yivi-core`, `@privacybydesign/yivi-client`, and `@privacybydesign/yivi-web`. If any import fails, this error is thrown.

Fix: install the Yivi packages:

```sh
npm install @privacybydesign/yivi-core @privacybydesign/yivi-client @privacybydesign/yivi-web
```

Or use `pg.sign.session()` or `pg.sign.apiKey()` instead.

## `DecryptionError`

Thrown when decryption fails for a non-identity reason.

Thrown when:
- Neither `element` nor `session` is provided for decryption
- Multiple recipients exist but no `recipient` parameter was given
- The ciphertext is malformed or corrupted

## `IdentityMismatchError`

A subclass of `DecryptionError`. Thrown when the Yivi attributes proven by the user do not match the encryption policy embedded in the ciphertext. For example, the message was encrypted for `alice@example.com` but the user proved `bob@example.com`.

## Real-world error handling

The SvelteKit download page handles all decryption error types:

```ts
			if (!uuid) return;
		}
		dlState = 'loading';

		try {
			unsealer = await createUnsealer(uuid);
			policies = unsealer.inspect_header();

			try {
```

<small>[Source: +page.svelte#L56-L64](https://github.com/encryption4all/postguard-examples/blob/6d538923ade9b013222685bec1f4588f610ccf86/pg-sveltekit/src/routes/download/+page.svelte#L56-L64)</small>
The Thunderbird addon handles errors in the decryption flow:

```ts
        bytes[i] = binaryString.charCodeAt(i);
      }
      createReadable = async () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
```

<small>[Source: background.ts#L798-L805](https://github.com/encryption4all/postguard-tb-addon/blob/d2ec84d26ab52044c3057dd3aeb7c8e1e3bc26ce/src/background/background.ts#L798-L805)</small>
::: tip
Always check for the most specific error first (`IdentityMismatchError`) and work up to the most general (`PostGuardError`), since they form an inheritance chain.
:::
