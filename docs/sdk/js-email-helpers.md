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

Takes a `Sealed` encryption builder and wraps the encrypted output into an email envelope. The function is async because it encrypts the data and may upload to Cryptify if the payload is too large.

The envelope contains a placeholder HTML body (telling the recipient to use PostGuard to decrypt), a plain text fallback, and the ciphertext as a file attachment named `postguard.encrypted`.

For small payloads (under 100 KB), the encrypted data is also embedded as an armored base64 block in the HTML and as a URL fragment in the decrypt button link. For large payloads, `createEnvelope` automatically uploads to Cryptify and puts a download link in the email instead.

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

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sealed` | `Sealed` | Yes | The Sealed encryption builder from `pg.encrypt()` |
| `from` | `string` | Yes | Sender email address |
| `websiteUrl` | `string` | No | URL to link in the placeholder body (default: `https://postguard.eu`) |
| `unencryptedMessage` | `string` | No | Unencrypted message shown in the placeholder |

### Result

| Property | Type | Description |
|----------|------|-------------|
| `subject` | `string` | Always `"PostGuard Encrypted Email"` |
| `htmlBody` | `string` | Placeholder HTML with decrypt button and armored payload |
| `plainTextBody` | `string` | Plain text fallback |
| `attachment` | `File` | The `postguard.encrypted` file |

## `extractCiphertext()`

Extracts the encrypted ciphertext from a received email. It checks two locations in order:

1. Attachments: looks for a file named `postguard.encrypted`
2. HTML body: looks for an armored payload between `-----BEGIN POSTGUARD MESSAGE-----` and `-----END POSTGUARD MESSAGE-----` markers

Returns a `Uint8Array` with the ciphertext, or `null` if nothing is found.

```ts
const ciphertext = pg.email.extractCiphertext({
  htmlBody: bodyHtml,
  attachments: attachmentData,
});
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `htmlBody` | `string` | No | The HTML body of the received email |
| `attachments` | `Array<{ name, data }>` | No | Email attachments (data as ArrayBuffer) |

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
