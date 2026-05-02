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

Pass `{ uuid }` to `pg.open()`, then call `decrypt()` with `element` (a CSS selector for the Yivi QR container) and an optional `recipient`. The result is a `DecryptFileResult` with a `download()` helper that triggers a browser download.

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

<small>[Source: background.ts#L710-L721](https://github.com/encryption4all/postguard-tb-addon/blob/26b8433efc8997bc1fe614f532caf17fb94b4a70/src/background/background.ts#L710-L721)</small>

### `DecryptDataResult`

| Property | Type | Description |
|----------|------|-------------|
| `plaintext` | `Uint8Array` | The decrypted data |
| `sender` | `FriendlySender \| null` | Verified sender identity |

### Decrypt parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `element` | `string` | No* | CSS selector for Yivi QR code container |
| `session` | `SessionCallback` | No* | Custom session callback for non-browser environments |
| `recipient` | `string` | No | Email of the recipient to decrypt for (required if multiple recipients) |
| `enableCache` | `boolean` | No | Cache the Yivi JWT so repeated decryptions don't require re-scanning the QR code |

*Provide either `element` or `session`. If neither is provided, the SDK throws a `DecryptionError`.

## Recipient selection

When the ciphertext was encrypted for multiple recipients, the SDK needs to know which recipient key to use. Pass the `recipient` parameter with the email address of the intended recipient. If there is only one recipient in the ciphertext, the parameter can be omitted.

## JWT caching

When `enableCache` is `true`, the SDK caches the JWT from a successful Yivi session. Subsequent `decrypt()` calls reuse the cached JWT instead of starting a new Yivi session, as long as the JWT has not expired. This is useful when decrypting multiple messages in a row for the same recipient.

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
- `YiviSessionError`: the Yivi disclosure session ended without success (cancelled, timed out, aborted)
- `NetworkError`: PKG or Cryptify communication failure

Catch `IdentityMismatchError` first to show a recipient-mismatch message, then `YiviSessionError` to surface a friendly "session cancelled" message instead of a generic decryption failure, then fall through to a generic error branch for everything else.

```ts
import { YiviSessionError, IdentityMismatchError } from '@e4a/pg-js';

try {
  const result = await pg.open({ uuid }).decrypt({ element: '#yivi-web-form' });
  result.download();
} catch (e) {
  if (e instanceof IdentityMismatchError) {
    showMessage('You are not a recipient of this message.');
    return;
  }
  if (e instanceof YiviSessionError) {
    showMessage(e.cancelled ? 'Sign-in cancelled.' : `Sign-in failed: ${e.reason}.`);
    return;
  }
  throw e;
}
```

See [Error Handling](/sdk/js-errors) for the full error reference.
