# Decryption

The SDK provides a single `decrypt()` method that handles two distinct flows based on the input:

| Input | Decrypts from | Returns |
|-------|---------------|---------|
| `{ uuid }` | Cryptify stored file | `DecryptFileResult` |
| `{ data }` | Raw ciphertext bytes | `DecryptDataResult` |

Both flows require the recipient to prove their identity through Yivi. You provide either an `element` (for browser-based Yivi QR) or a `session` callback (for custom flows).

## Decrypt from Cryptify UUID

Downloads and decrypts a file stored on Cryptify. The SvelteKit example reads the UUID from a URL query parameter and renders a Yivi QR widget:

<<< @/snippets/postguard-examples/pg-sveltekit/src/routes/download/+page.svelte{1-75}

::: warning
Requires `cryptifyUrl` to be set in the constructor.
:::

### `DecryptFileResult`

The result contains the decrypted files as a ZIP blob, the sender identity, and a `download()` helper:

| Property | Type | Description |
|----------|------|-------------|
| `files` | `string[]` | Filenames inside the ZIP |
| `sender` | `SenderIdentity \| null` | Verified sender identity |
| `blob` | `Blob` | The decrypted ZIP blob |
| `download` | `(filename?: string) => void` | Trigger a browser download |

## Decrypt from Raw Data

Decrypts raw ciphertext bytes (e.g. from an encrypted email). The Thunderbird addon extracts ciphertext from the email and decrypts using a session callback:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{713-738 ts}

### `DecryptDataResult`

| Property | Type | Description |
|----------|------|-------------|
| `plaintext` | `Uint8Array` | The decrypted data |
| `sender` | `SenderIdentity \| null` | Verified sender identity |

## Recipient Selection

When the ciphertext was encrypted for multiple recipients, the SDK needs to know which recipient key to use. Pass the `recipient` parameter with the email address of the intended recipient. If there is only one recipient in the ciphertext, the parameter can be omitted.

## Sender Identity

Both result types include a `sender` field with the verified identity of the person who encrypted the data. The SvelteKit example extracts the sender email:

<<< @/snippets/postguard-examples/pg-sveltekit/src/routes/download/+page.svelte{66-69 ts}

The Thunderbird addon extracts both public and private sender attributes to build identity badges:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{742-750 ts}

## Error Handling

Decryption can throw:

- `DecryptionError`: general decryption failure, or missing `element`/`session`
- `IdentityMismatchError`: the Yivi attributes did not match the encryption policy
- `NetworkError`: PKG or Cryptify communication failure

The SvelteKit download page handles these errors:

<<< @/snippets/postguard-examples/pg-sveltekit/src/routes/download/+page.svelte{56-64 ts}

See [Error Handling](/sdk/errors) for the full error reference.
