# Encryption

`pg.encrypt()` returns a `Sealed` builder. The builder captures encryption parameters but does no work until you call a terminal method.

## Terminal methods

| Method | What it does | Returns |
|--------|--------------|---------|
| `sealed.toBytes()` | Encrypt and buffer in memory | `Promise<Uint8Array>` |
| `sealed.upload()` | Encrypt and stream to Cryptify (silent, no Cryptify-sent emails) | `Promise<{ uuid }>` |
| `sealed.upload({ notify })` | Same, plus opt-in Cryptify-sent emails | `Promise<{ uuid }>` |

## Recipients

Before encrypting, build one or more recipients. PostGuard can encrypt with any wallet attribute. Email is the most common, but you can also target recipients by domain or custom attributes.

The SvelteKit example encrypts for a citizen (exact email) and an organisation (email domain):

```ts
const sealed = pg.encrypt({
  files,
  recipients: [
    pg.recipient.email(citizen.email),
    pg.recipient.emailDomain(organisation.email)
  ],
  sign: pg.sign.apiKey(apiKey),
  onProgress,
  signal: abortController?.signal
});
```

<small>[Source: encryption.ts#L27-L33](https://github.com/encryption4all/postguard-examples/blob/3d06342fad2c749ca4d043070d1ad9c831c7bfc1/pg-sveltekit/src/lib/postguard/encryption.ts#L27-L33)</small>

Under the hood, `pg.recipient.email()` creates a policy with the attribute type `pbdf.sidn-pbdf.email.email`, while `pg.recipient.emailDomain()` extracts the domain from the email and uses `pbdf.sidn-pbdf.email.domain`.

Both methods return a `RecipientBuilder` that supports fluent chaining with `.extraAttribute()` to require additional attributes beyond the base email or domain:

```ts
pg.recipient.email('alice@example.com')
  .extraAttribute('pbdf.gemeente.personalData.surname', 'Smith')
  .extraAttribute('pbdf.sidn-pbdf.mobilenumber.mobilenumber', '0612345678')
```

## Encrypt and upload

Encrypts files, bundles them into a ZIP, and streams the encrypted data to Cryptify. Returns a UUID that recipients use to download and decrypt.

```ts
const sealed = pg.encrypt({
  files,
  recipients: [pg.recipient.email(citizen.email), pg.recipient.emailDomain(organisation.email)],
  sign: pg.sign.apiKey(apiKey),
  onProgress,
  signal: abortController?.signal
});

// Silent upload — no Cryptify-sent emails. Returns UUID for custom delivery.
const { uuid } = await sealed.upload();

// Or opt into Cryptify-sent emails. `recipients: true` emails each
// recipient with a download link; `sender: true` adds a confirmation
// back to the sender. Both default false.
const { uuid } = await sealed.upload({
  notify: {
    recipients: true,
    sender: false,
    message: 'Here are your files',
    language: 'EN'
  }
});
```

<small>[Source: encryption.ts#L24-L60](https://github.com/encryption4all/postguard-examples/blob/3d06342fad2c749ca4d043070d1ad9c831c7bfc1/pg-sveltekit/src/lib/postguard/encryption.ts#L24-L60)</small>

::: warning
Requires `cryptifyUrl` to be set in the constructor.
:::

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files` | `File[] \| FileList` | Yes* | Files to encrypt (zipped automatically) |
| `data` | `Uint8Array \| ReadableStream` | Yes* | Raw data to encrypt (no zipping) |
| `sign` | `SignMethod` | Yes | Authentication method |
| `recipients` | `Recipient[]` | Yes | One or more recipients |
| `onProgress` | `(pct: number) => void` | No | Upload progress callback (0-100) |
| `signal` | `AbortSignal` | No | Cancel the operation |

*Provide either `files` or `data`, not both.

### Retry options

Pass `retry` on the `PostGuardConfig` to tune how chunk PUTs and downloads handle transient failures. Defaults are sensible — supply a partial object to override only what you need.

```ts
const pg = new PostGuard({
  pkgUrl: 'https://pkg.staging.postguard.eu',
  cryptifyUrl: 'https://storage.staging.postguard.eu',
  retry: {
    maxAttempts: 5,
    chunkTimeoutMs: 60_000,
    onRetry: ({ attempt, maxAttempts, nextDelayMs }) => {
      console.log(`retrying in ${nextDelayMs} ms (attempt ${attempt} of ${maxAttempts})`);
    },
  },
});
```

<small>[Source: retry.ts#L3-L27](https://github.com/encryption4all/postguard-js/blob/a60716e0b4eaaed0f3763a2eebbcf6c39fc0560d/src/util/retry.ts#L3-L27)</small>

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxAttempts` | `number` | `5` | Total attempts including the first one |
| `initialDelayMs` | `number` | `500` | Delay before the first retry |
| `maxDelayMs` | `number` | `30_000` | Cap on the pre-jitter exponential delay |
| `multiplier` | `number` | `2` | Multiplier applied between attempts |
| `chunkTimeoutMs` | `number` | `60_000` | Per-attempt timeout for a chunk PUT |
| `finalizeTimeoutMs` | `number` | `120_000` | Per-attempt timeout for the finalize call |
| `downloadTimeoutMs` | `number` | `0` (off) | Per-attempt timeout for the download GET. `0` means no per-attempt timeout — the retry budget bounds it instead |
| `onRetry` | `(event: RetryEvent) => void` | `undefined` | Fires after a retriable failure, before the backoff delay |

`RetryEvent` carries `attempt` (1-indexed, the attempt that just failed), `maxAttempts`, the underlying `error`, and `nextDelayMs`. Use it to drive a "retrying… (attempt N of M)" indicator.

What gets retried: 5xx responses, fetch-level network errors (`TypeError` from `Failed to fetch`), and per-attempt timeout aborts. What does not: 4xx responses, `UploadSessionExpiredError` (see [Error Handling](/sdk/js-errors#uploadsessionexpirederror)), and caller-driven aborts via your `AbortSignal`. `initUpload` and `finalizeUpload` are deliberately not retried — both are session-defining steps where a silent retry could mask a server-side state mismatch.

The same `retry` config governs downloads. See [Decryption — Retries and resumable downloads](/sdk/js-decryption#retries-and-resumable-downloads).

## Resume an interrupted upload

A long-running upload can be interrupted by a page refresh, tab crash, navigation away, or process restart. The SDK exposes two primitives for rehydrating an in-flight session from Cryptify rather than starting over: the `FileState` type and the `resumeUpload` function.

### `FileState`

`FileState` carries everything Cryptify needs to accept the next chunk for an in-flight upload. The two persistable fields are `uuid` and `recoveryToken`; the rest can be reconstructed by calling `resumeUpload`.

| Field | Type | Description |
|-------|------|-------------|
| `token` | `string` | Current rolling token sent on the next chunk PUT |
| `prevToken` | `string \| undefined` | Token from the most recent committed chunk. Used on retry so Cryptify's idempotent-retry path can replay a lost response. `undefined` until the first chunk is committed |
| `uuid` | `string` | Upload UUID issued at init |
| `recoveryToken` | `string` | Bearer credential issued by `POST /fileupload/init` (wire field `recovery_token`). Persist alongside `uuid` in consumer-owned storage |

<small>[Source: cryptify.ts#L13-L33](https://github.com/encryption4all/postguard-js/blob/6205fc309aaf954e82937beae723912812604f2e/src/api/cryptify.ts#L13-L33)</small>

### `resumeUpload`

```ts
import { resumeUpload, type FileState } from '@e4a/pg-js';

const { state, uploaded } = await resumeUpload(
  cryptifyUrl,
  uuid,
  recoveryToken,
  signal
);
```

Calls `GET /fileupload/{uuid}/status` with the `X-Recovery-Token` header and returns `{ state: FileState; uploaded: number }`:

- `cryptify_token` from the response is mapped to `state.token`.
- `prev_token` is mapped to `state.prevToken` and is omitted before the first committed chunk.
- `uploaded` is the byte offset to resume from.

<small>[Source: cryptify.ts#L143-L178](https://github.com/encryption4all/postguard-js/blob/6205fc309aaf954e82937beae723912812604f2e/src/api/cryptify.ts#L143-L178)</small>

### Failure mode

A 404 response with Cryptify's structured `upload_session_not_found` body surfaces as `UploadSessionExpiredError`. Cryptify deliberately collapses "unknown UUID" and "wrong recovery token" into the same response, so callers should treat both the same way: the session is gone, start a new upload. See [`UploadSessionExpiredError`](/sdk/js-errors#uploadsessionexpirederror) in the error reference.

### Capture `recoveryToken` via `onUploadInit`

`UploadOptions` and `CreateEnvelopeOptions` accept an `onUploadInit` callback that hands the caller the `{uuid, recoveryToken}` pair needed by `resumeUpload`. Persist both fields to durable storage from inside the callback so a later session can rehydrate the upload after a process restart.

| Field | Type | Description |
|-------|------|-------------|
| `onUploadInit` | `(info: { uuid: string; recoveryToken: string }) => void` | Fires once, synchronously, after `upload_init` resolves and before the first chunk PUT |

The callback runs inside the upload stream's `start` handler. Keep the body short and synchronous; a throw errors the upload stream. A `chrome.storage.local.set` or `localStorage.setItem` is fine.

<small>[Source: types.ts#L107-L112](https://github.com/encryption4all/postguard-js/blob/dcdd6591f58976364f8220f4cedbe86d0e2bce3b/src/types.ts#L107-L112)</small>

With `Sealed.upload`:

```ts
const sealed = pg.encrypt({ sign, recipients, files });
const result = await sealed.upload({
  onUploadInit: ({ uuid, recoveryToken }) => {
    localStorage.setItem('pg-upload', JSON.stringify({ uuid, recoveryToken }));
  },
});
```

With `createEnvelope`, pass the same callback through `CreateEnvelopeOptions`:

```ts
import { createEnvelope } from '@e4a/pg-js';

const envelope = await createEnvelope({
  sealed,
  from,
  onUploadInit: ({ uuid, recoveryToken }) => {
    chrome.storage.local.set({ pgUpload: { uuid, recoveryToken } });
  },
});
```

After a restart, read the stored pair and call `resumeUpload(cryptifyUrl, uuid, recoveryToken, signal)` to recover the in-flight session.

<small>[Source: types.ts#L246-L250](https://github.com/encryption4all/postguard-js/blob/dcdd6591f58976364f8220f4cedbe86d0e2bce3b/src/types.ts#L246-L250)</small>

### Notify options

The upload is silent by default. Both recipient and sender mails are opt-in. Pass `notify` to enable either or both.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `recipients` | `boolean` | `false` | Send a download-link email to each recipient |
| `sender` | `boolean` | `false` | Send a delivery confirmation to the sender |
| `message` | `string` | `undefined` | Optional unencrypted text included in any mail sent |
| `language` | `'EN' \| 'NL'` | `'EN'` | Notification email template language |

The SDK validates the `notify` shape and throws `TypeError` for common misuse like `{ notify: true }`, a top-level `recipients`, or non-boolean values such as `{ recipients: 'yes' }`. Catch this in tests rather than at runtime.

If `notify` is omitted on the first `sealed.upload()` for a given `PostGuard` instance, the SDK logs a one-time `console.info` reminding you that the upload is silent and how to opt in. Pass `{ recipients: false }` to acknowledge the silent intent and suppress the notice — the validator counts both as explicit shapes.

## Encrypt raw data

For email addons, use `data` instead of `files`. The Thunderbird addon's crypto popup encrypts the full MIME message (body + attachments) as raw bytes, then wraps it in an email envelope:

```ts
const sealed = pg.encrypt({
  sign: pg.sign.yivi({
    element: "#yivi-web-form",
    senderEmail: data.senderEmail,
  }),
  recipients,
  data: mimeData,
});

const envelope = await pg.email.createEnvelope({
  sealed,
  from: data.from,
  websiteUrl: data.websiteUrl,
});
```

<small>[Source: yivi-popup.ts#L90-L136](https://github.com/encryption4all/postguard-tb-addon/blob/26b8433efc8997bc1fe614f532caf17fb94b4a70/src/pages/yivi-popup/yivi-popup.ts#L90-L136)</small>

Call `.toBytes()` to get the encrypted data, or pass the `Sealed` object directly to `pg.email.createEnvelope()` for email integration.

## Error handling

All encryption methods can throw:

- `PostGuardError`: general SDK error
- `NetworkError`: PKG or Cryptify communication failure (includes `status` and `body` properties)
- `YiviNotInstalledError`: Yivi packages not installed (when using `pg.sign.yivi`)
- `YiviSessionError`: the Yivi disclosure session ended without success (cancelled, timed out, aborted), only when using `pg.sign.yivi`

When the sender uses `pg.sign.yivi(...)`, distinguish a cancelled disclosure from a real failure by checking `YiviSessionError` first:

```ts
import { YiviSessionError } from '@e4a/pg-js';

try {
  const { uuid } = await pg.encrypt({
    files,
    recipients,
    sign: pg.sign.yivi({ element: '#yivi-web-form', senderEmail }),
  }).upload();
} catch (e) {
  if (e instanceof YiviSessionError) {
    showMessage(e.cancelled ? 'Sign-in cancelled.' : `Sign-in failed: ${e.reason}.`);
    return;
  }
  throw e;
}
```

See [Error Handling](/sdk/js-errors) for the full error reference.
