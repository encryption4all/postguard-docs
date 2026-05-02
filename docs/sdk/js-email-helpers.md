# Email Helpers

The SDK includes email helper methods for building and parsing PostGuard-encrypted emails. They are available both as instance methods on `pg.email.*` and as standalone imports from `@e4a/pg-js`. The standalone imports are useful in contexts like extension background scripts where you don't need a full PostGuard instance. All examples below come from the [Thunderbird addon](https://github.com/encryption4all/postguard-tb-addon).

```ts
// Standalone imports (no PostGuard instance needed)
import { buildMime, extractCiphertext, injectMimeHeaders, createEnvelope } from '@e4a/pg-js';

// Or use instance methods
pg.email.buildMime(...)
pg.email.extractCiphertext(...)
```

## Overview

Encrypting an email with PostGuard follows this workflow:

```
1. Build inner MIME    -->  buildMime()  or  pg.email.buildMime()
2. Encrypt the MIME    -->  pg.encrypt({ data: mimeBytes })
3. Create envelope     -->  pg.email.createEnvelope({ sealed, from })
4. Send the envelope via your email client / API
```

Decrypting reverses the process:

```
1. Extract ciphertext  -->  extractCiphertext()  or  pg.email.extractCiphertext()
2. Open + decrypt      -->  pg.open({ data }).decrypt({ session })
3. Parse the plaintext MIME
```

## `buildMime()`

Constructs a MIME message from structured input. Returns the raw MIME bytes as a `Uint8Array`. The output includes proper headers (Date, MIME-Version, Content-Type, X-PostGuard) and handles multipart encoding for attachments.

The Thunderbird addon builds the inner MIME from compose details:

```ts
const mimeData = buildMime({
  from: details.from,
  to: [...details.to],
  cc: [...details.cc],
  subject: originalSubject,
  htmlBody: details.isPlainText ? undefined : details.body,
  plainTextBody: details.isPlainText ? details.plainTextBody : undefined,
  date,
  inReplyTo,
  references,
  attachments: attachmentData,
});
```

<small>[Source: background.ts#L331-L342](https://github.com/encryption4all/postguard-tb-addon/blob/26b8433efc8997bc1fe614f532caf17fb94b4a70/src/background/background.ts#L331-L342)</small>

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | `string` | Yes | Sender email address |
| `to` | `string[]` | Yes | Recipient email addresses |
| `cc` | `string[]` | No | CC email addresses |
| `subject` | `string` | Yes | Email subject line |
| `htmlBody` | `string` | No | HTML body content |
| `plainTextBody` | `string` | No | Plain text body content |
| `date` | `Date` | No | Send date (defaults to now) |
| `inReplyTo` | `string` | No | Message-ID of the email being replied to |
| `references` | `string` | No | References header for threading |
| `attachments` | `Array<{ name, type, data }>` | No | File attachments (data as ArrayBuffer) |

::: tip
Provide at least one of `htmlBody` or `plainTextBody`. If both are provided, the MIME message includes both as a `multipart/alternative` section. If attachments are present, the message uses `multipart/mixed`.
:::

## `createEnvelope()`

Takes a `Sealed` encryption builder and wraps the encrypted output into an email envelope. The function is async because it encrypts the data and may upload to Cryptify.

The envelope contains a placeholder HTML body (telling the recipient to use PostGuard to decrypt), a plain text fallback, and (in most cases) the ciphertext as a file attachment named `postguard.encrypted`.

### Tier model

`createEnvelope` picks one of three tiers based on the encrypted payload size. Each tier decides whether to attach the ciphertext locally, whether to upload it to Cryptify, and which kind of fallback link to put in the body.

| Tier | Selected when | Local attachment | Cryptify upload | Body fallback link |
|------|---------------|------------------|-----------------|--------------------|
| 1 | base64 ciphertext length ≤ `PG_MAX_URL_FRAGMENT_SIZE` | yes | no | `/decrypt#<base64>` (whole ciphertext in the URL fragment) |
| 2 | ciphertext bytes ≤ `PG_MAX_ATTACHMENT_SIZE` | yes | yes (opt out with `uploadToCryptify: false`) | `/decrypt?uuid=…` (data) or `/download?uuid=…` (files) |
| 3 | ciphertext bytes > `PG_MAX_ATTACHMENT_SIZE` | no | yes (always) | `/decrypt?uuid=…` (data) or `/download?uuid=…` (files) |

Tier 3 omits the local attachment because Exchange tenants typically reject messages with attachments above ~25 MB. Recipients of a tier 3 envelope rely on the Cryptify download link in the body.

The constants are exported from `@e4a/pg-js`:

| Constant | Default | Meaning |
|----------|---------|---------|
| `PG_MAX_URL_FRAGMENT_SIZE` | `100_000` | Tier 1 cap, in characters of base64 ciphertext |
| `PG_MAX_ATTACHMENT_SIZE` | `10 * 1024 * 1024` | Tier 2/3 boundary, in bytes of binary ciphertext |

<small>[Source: extract.ts#L1-L12](https://github.com/encryption4all/postguard-js/blob/91c84855b4613e9c8c1fe65fc0f5a4dc4c6d11d6/src/email/extract.ts#L1-L12)</small>

The tier-selection logic itself is a few lines:

```ts
function pickTier(encryptedBytes: number, base64Length: number): EnvelopeTier {
  if (base64Length <= PG_MAX_URL_FRAGMENT_SIZE) return 'tier1';
  if (encryptedBytes <= PG_MAX_ATTACHMENT_SIZE) return 'tier2';
  return 'tier3';
}
```

<small>[Source: envelope.ts#L141-L145](https://github.com/encryption4all/postguard-js/blob/91c84855b4613e9c8c1fe65fc0f5a4dc4c6d11d6/src/email/envelope.ts#L141-L145)</small>

::: warning Breaking change in 0.10
Earlier releases always emitted a hidden `<div id="postguard-armor">` block in `htmlBody` carrying the full base64 ciphertext, and `attachment` was always a `File`. Both have changed. The armor block has been removed (it pushed bodies past Outlook's 1 M-character `setAsync` limit), and `attachment` is now `File | null` — null for tier 3.
:::

### Usage

The Thunderbird addon creates the envelope in one call:

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

<small>[Source: yivi-popup.ts#L90-L136](https://github.com/encryption4all/postguard-tb-addon/blob/57234eebd32d64bd011086fe89ecdd7ac40fc15d/src/pages/yivi-popup/yivi-popup.ts#L90-L136)</small>

Callers that handle the result must null-check `envelope.attachment` before reading it, since tier 3 envelopes carry no attachment.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sealed` | `Sealed` | Yes | The Sealed encryption builder from `pg.encrypt()` |
| `from` | `string` | Yes | Sender email address |
| `websiteUrl` | `string` | No | URL to link in the placeholder body (default: `https://postguard.eu`) |
| `unencryptedMessage` | `string` | No | Unencrypted message shown in the placeholder |
| `senderAttributes` | `string[]` | No | Verified sender attributes to display below the sender name |
| `uploadToCryptify` | `boolean` | No | Default `true`. Set `false` to keep tier 2 envelopes as a local attachment only and skip the Cryptify upload + body link. Has no effect on tier 1 (no upload happens) or tier 3 (upload is always attempted because there is no fallback). |

### Result

| Property | Type | Description |
|----------|------|-------------|
| `subject` | `string` | Always `"PostGuard Encrypted Email"` |
| `htmlBody` | `string` | Placeholder HTML with the decrypt button and the fallback link for the selected tier |
| `plainTextBody` | `string` | Plain text fallback |
| `attachment` | `File \| null` | The `postguard.encrypted` file in tiers 1 and 2, `null` in tier 3 |
| `tier` | `'tier1' \| 'tier2' \| 'tier3'` | Which tier was selected |
| `uploadUuid` | `string \| null` | Cryptify UUID if the payload was uploaded, otherwise `null` |

## `extractCiphertext()`

Extracts the encrypted ciphertext from a received email by looking for an attachment named `postguard.encrypted`. Returns a `Uint8Array` with the ciphertext, or `null` if no such attachment is found.

```ts
const ciphertext = pg.email.extractCiphertext({
  htmlBody: bodyHtml,
  attachments: attachmentData,
});
```

<small>[Source: extract.ts#L14-L28](https://github.com/encryption4all/postguard-js/blob/91c84855b4613e9c8c1fe65fc0f5a4dc4c6d11d6/src/email/extract.ts#L14-L28)</small>

Tier 3 envelopes carry no attachment, so `extractCiphertext` returns `null` on them. Pair it with `extractUploadUuid` to find a Cryptify UUID in the body and download the ciphertext from there.

The `htmlBody` field is accepted for compatibility but is no longer consulted. The legacy in-body armor block (`<div id="postguard-armor">` and the `-----BEGIN POSTGUARD MESSAGE-----` markers) is no longer emitted, and consumer code that stripped or parsed it can be removed.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `htmlBody` | `string` | No | Accepted for compatibility, no longer consulted |
| `attachments` | `Array<{ name, data }>` | No | Email attachments (data as ArrayBuffer) |

## `extractUploadUuid()`

Finds a Cryptify UUID in the HTML body of a received email. It matches either the `/decrypt?uuid=…` or `/download?uuid=…` link produced by tier 2 and tier 3 envelopes. Returns the UUID, or `null` if none is found.

```ts
const uuid = pg.email.extractUploadUuid(htmlBody);
```

<small>[Source: extract.ts#L35-L43](https://github.com/encryption4all/postguard-js/blob/91c84855b4613e9c8c1fe65fc0f5a4dc4c6d11d6/src/email/extract.ts#L35-L43)</small>

## `injectMimeHeaders()`

Adds or replaces headers in a raw MIME string. The function splits the MIME at the `\r\n\r\n` separator, processes the header section (including folded multi-line headers), and reassembles the result.

The Thunderbird addon injects threading headers and an `X-PostGuard` marker into decrypted messages:

```ts
// Inject threading headers from the outer (encrypted) message
let raw = pg.email.injectMimeHeaders(
  plaintext,
  { "In-Reply-To": inReplyTo, "References": references },
);

// Mark it as a PostGuard-decrypted message
raw = pg.email.injectMimeHeaders(raw, { "X-PostGuard": "decrypted" });
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mime` | `string` | Yes | The raw MIME string |
| `headersToInject` | `Record<string, string>` | Yes | Headers to add |
| `headersToRemove` | `string[]` | No | Headers to remove first |
