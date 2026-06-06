# Decryption

`pg.open()` returns an `Opened` builder. It supports two inputs:

| Input | Source | Typical use | Result shape |
|-------|--------|-------------|--------------|
| `{ uuid }` | Cryptify stored file | Web apps, download links | mirrors the upload mode (see below) |
| `{ data }` | Raw ciphertext bytes | Email addons | `DecryptDataResult` |

Both require the recipient to prove their identity through Yivi. You provide either an `element` (DOM selector for Yivi QR) or a `session` callback (for custom flows like popup windows).

For `{ uuid }`, the result depends on how the payload was uploaded: `Sealed.upload({ files })` yields `DecryptFileResult`, while `Sealed.upload({ data })` yields `DecryptDataResult` (see [Decrypt from Cryptify UUID](#decrypt-from-cryptify-uuid)).

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

Pass `{ uuid }` to `pg.open()`, then call `decrypt()` with `element` (a CSS selector for the Yivi QR container) and an optional `recipient`.

The return type is the union `DecryptResult = DecryptFileResult | DecryptDataResult`. Which variant you get mirrors how the payload reached Cryptify:

- Uploaded via `Sealed.upload({ files })` → `DecryptFileResult` with a `files` array of `{ name, blob }` entries, the raw ZIP as `blob`, and a `download()` helper that fans out one browser download per entry.
- Uploaded via `Sealed.upload({ data })` → `DecryptDataResult` with `plaintext` as a `Uint8Array`.

This keeps the round-trip `pg.encrypt({ data }).upload()` → `pg.open({ uuid }).decrypt()` symmetric: raw bytes go in, raw bytes come out. Internally, `Sealed.upload({ data })` wraps the bytes as a single-entry zip named `data.bin`; on decrypt the SDK inspects the inner zip's central directory and, when the entries are exactly `['data.bin']`, unwraps that entry and returns `DecryptDataResult`.

<small>[Source: opened.ts#L99-L121](https://github.com/encryption4all/postguard-js/blob/146a7ab70ea8acc6071a4c773a8ae467c1c391a9/src/opened.ts#L99-L121)</small>

Narrow the union at runtime with an `in` check:

```ts
const result = await pg.open({ uuid }).decrypt({ element: '#yivi-web-form' });

if ('plaintext' in result) {
  // DecryptDataResult: payload was uploaded with Sealed.upload({ data })
  handleBytes(result.plaintext);
} else {
  // DecryptFileResult: payload was uploaded with Sealed.upload({ files })
  result.download();
}
```

::: warning
Requires `cryptifyUrl` to be set in the constructor.
:::

### `DecryptFileResult`

Returned when the payload was uploaded with `Sealed.upload({ files })`.

| Property | Type | Description |
|----------|------|-------------|
| `files` | `Array<{ name: string; blob: Blob }>` | One entry per file inside the ZIP, with the entry's filename and decoded `Blob` |
| `sender` | `FriendlySender \| null` | Verified sender identity with `.email` and `.attributes` |
| `blob` | `Blob` | The raw decrypted ZIP, as an escape hatch for callers that want to re-upload, hand-process, or offer a single "Download as ZIP" button |
| `download` | `() => void` | Triggers one browser download per entry in `files` |

::: warning Breaking change in v2
Prior to `@e4a/pg-js@2.0.0`, `files` was `string[]` (filenames only) and `download` took an optional `filename` argument that selected a single entry. The new `download()` takes no arguments and fans out per entry; callers that want a single combined download can pipe `blob` through their own anchor. Source: [encryption4all/postguard-js#86](https://github.com/encryption4all/postguard-js/pull/86).
:::

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

Returned from `{ data }` decryption, and from `{ uuid }` when the payload was uploaded with `Sealed.upload({ data })`.

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
| `onDownloadProgress` | `(pct: number \| undefined) => void` | No | Progress callback for the streaming download+decrypt pipeline. Fires on every chunk with `0–100` when the server set `Content-Length`, or `undefined` when it didn't (consumer should render an indeterminate indicator). Available since `@e4a/pg-js@2.0.0` ([#86](https://github.com/encryption4all/postguard-js/pull/86)) |

*Provide either `element` or `session`. If neither is provided, the SDK throws a `DecryptionError`.

## Retries and resumable downloads

The download GET retries transient failures using the same `retry` config as uploads — see [Encryption — Retry options](/sdk/js-encryption#retry-options) for the full table and defaults.

A mid-stream failure (network drop, idle timeout) does not start over from byte zero. The SDK reissues the GET with a `Range: bytes=<received>-` header and splices the resumed body onto what the consumer already saw. The retry counter is shared across resumes, so a flapping connection that delivers some bytes per attempt still exhausts the budget rather than looping forever.

```ts
const pg = new PostGuard({
  pkgUrl, cryptifyUrl,
  retry: {
    onRetry: ({ attempt, maxAttempts, nextDelayMs }) => {
      ui.showRetry(attempt, maxAttempts, nextDelayMs);
    },
  },
});

const result = await pg.open({ uuid }).decrypt({ element: '#yivi-web-form' });
result.download();
```

A resume is only accepted when Cryptify replies `206 Partial Content` with a `Content-Range` whose start byte matches the requested offset. A `200 OK` on a resume request is treated as fail-not-retry — some intermediaries (caching proxies, misconfigured CDNs) silently ignore `Range` and return the full body from byte zero, which would corrupt the decoded stream. The SDK surfaces the mismatch as a `NetworkError` so the retry loop short-circuits.

<small>[Source: cryptify.ts#L238-L277](https://github.com/encryption4all/postguard-js/blob/a60716e0b4eaaed0f3763a2eebbcf6c39fc0560d/src/api/cryptify.ts#L238-L277)</small>

::: warning Behaviour change in v1.6
The internal `downloadFileWithRetry` helper now returns its `ReadableStream` synchronously instead of via a `Promise`. Stream-level errors (including the no-more-retries terminal error) surface on the consumer's first `read()`, not as a function-level rejection. Callers using the public `pg.open({ uuid }).decrypt(...)` API are unaffected — the SDK consumes the stream internally and a single `await` still surfaces the same errors. Only direct consumers of `downloadFileWithRetry` need to adjust.
:::

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

Since `@e4a/pg-js@2.0.0`, `IdentityMismatchError` preserves the underlying error on `.cause` when the failure was not a real identity mismatch (network drop during streaming, WASM panic, malformed ciphertext). Inspect `err.cause` when debugging a transient failure that surfaces as a mismatch. An `AbortError` from a caller-supplied `signal` passes through as-is — it is not rewrapped. Source: [encryption4all/postguard-js#84](https://github.com/encryption4all/postguard-js/pull/84).

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
