# Decryption

`pg.open()` returns an `Opened` builder. It supports two inputs:

| Input | Source | Typical use |
|-------|--------|-------------|
| `{ uuid }` | Cryptify stored file | Web apps, download links |
| `{ data }` | Raw ciphertext bytes | Email addons |

Both require the recipient to prove their identity through Yivi. You provide either an `element` (DOM selector for Yivi QR) or a `session` callback (for custom flows like popup windows).

## Inspect before decrypt

The `Opened` builder supports inspecting the encrypted header without decrypting. This is useful for showing who the message is from and which recipients can decrypt it, before the Yivi session starts.

```ts
const opened = pg.open({ uuid });
const info = await opened.inspect();
// info.recipients: ['alice@example.com', 'info@organisation.nl']
// info.sender: { email: 'bob@example.com', attributes: [...] }
// info.policies: Map with raw policy data
```

The unsealer is cached after `inspect()`, so a following `decrypt()` reuses it without re-downloading.

## Decrypt from Cryptify UUID

The SvelteKit example reads the UUID from a URL query parameter, opens a Yivi QR widget for identity verification, and auto-downloads the decrypted files:

```ts
const opened = pg.open({ uuid });
const decrypted = await opened.decrypt({
  element: '#yivi-web',
  recipient: recipientParam || undefined
});

result = decrypted as DecryptFileResult;
senderEmail = result.sender?.email ?? '';

// Auto-download
result.download();
```

<small>[Source: +page.svelte#L47-L56](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/routes/download/+page.svelte#L47-L56)</small>

::: warning
Requires `cryptifyUrl` to be set in the constructor.
:::

### `DecryptFileResult`

| Property | Type | Description |
|----------|------|-------------|
| `files` | `string[]` | Filenames inside the ZIP |
| `sender` | `FriendlySender \| null` | Verified sender identity with `.email` and `.attributes` |
| `blob` | `Blob` | The decrypted ZIP blob |
| `download` | `(filename?: string) => void` | Trigger a browser download |

## Decrypt from raw data

Decrypts raw ciphertext bytes (e.g. from an encrypted email). The Thunderbird addon extracts ciphertext from the email and decrypts using a session callback:

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

<small>[Source: background.ts#L710-L721](https://github.com/encryption4all/postguard-tb-addon/blob/feat/implement-sdk/src/background/background.ts#L710-L721)</small>

### `DecryptDataResult`

| Property | Type | Description |
|----------|------|-------------|
| `plaintext` | `Uint8Array` | The decrypted data |
| `sender` | `FriendlySender \| null` | Verified sender identity |

## Recipient selection

When the ciphertext was encrypted for multiple recipients, the SDK needs to know which recipient key to use. Pass the `recipient` parameter with the email address of the intended recipient. If there is only one recipient in the ciphertext, the parameter can be omitted.

## Sender identity

Both result types include a `sender` field with the verified identity of the person who encrypted the data. The `FriendlySender` type provides direct access to the email without manual parsing:

```ts
senderEmail = result.sender?.email ?? '';
```

The full `FriendlySender` type:

| Property | Type | Description |
|----------|------|-------------|
| `email` | `string \| null` | Sender's email, extracted from identity attributes |
| `attributes` | `Array<{ type, value? }>` | All identity attributes |
| `raw` | `SenderIdentity` | Raw identity structure for advanced use |

## Error handling

Decryption can throw:

- `DecryptionError`: general decryption failure, or missing `element`/`session`
- `IdentityMismatchError`: the Yivi attributes did not match the encryption policy
- `NetworkError`: PKG or Cryptify communication failure

The SvelteKit download page handles these:

```ts
try {
  const opened = pg.open({ uuid });
  const decrypted = await opened.decrypt({
    element: '#yivi-web',
    recipient: recipientParam || undefined
  });
  // success
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

See [Error Handling](/sdk/errors) for the full error reference.
