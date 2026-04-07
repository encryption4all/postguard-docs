# Email Helpers

The SDK includes email helper methods for building and parsing PostGuard-encrypted emails. These are available both as instance methods on `pg.email.*` and as standalone exports.

## Overview

Encrypting an email with PostGuard follows this workflow:

```
1. Build inner MIME    -->  pg.email.buildMime()
2. Encrypt the MIME    -->  pg.encrypt()
3. Create envelope     -->  pg.email.createEnvelope()
4. Send the envelope via your email client / API
```

Decrypting reverses the process:

```
1. Extract ciphertext  -->  pg.email.extractCiphertext()
2. Decrypt             -->  pg.decrypt({ data })
3. Parse the plaintext MIME
```

## `buildMime()`

Constructs a MIME message from structured input. Returns the raw MIME bytes as a `Uint8Array`. The output includes proper headers (Date, MIME-Version, Content-Type, X-PostGuard) and handles multipart encoding for attachments.

```ts
const mimeData = pg.email.buildMime({
  from: 'sender@example.com',
  to: ['alice@example.com', 'bob@example.com'],
  cc: ['carol@example.com'],
  subject: 'Quarterly Report',
  htmlBody: '<h1>Report</h1><p>See attached.</p>',
  plainTextBody: 'Report\n\nSee attached.',
  date: new Date(),
  inReplyTo: '<original-message-id@example.com>',
  references: '<thread-root@example.com> <original-message-id@example.com>',
  attachments: [
    {
      name: 'report.pdf',
      type: 'application/pdf',
      data: pdfArrayBuffer,
    },
  ],
})
```

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

Takes encrypted bytes and wraps them into an email envelope structure. The envelope contains a placeholder HTML body (informing the recipient to use PostGuard to decrypt), a plain text fallback, and the ciphertext as a file attachment named `postguard.encrypted`.

If the ciphertext is under 100 KB, the encrypted data is also embedded as an armored (base64-encoded) block in the HTML body. This allows email addons to extract the ciphertext directly from the HTML without needing the attachment.

```ts
const envelope = pg.email.createEnvelope({
  encrypted: ciphertext,     // Uint8Array from pg.encrypt()
  from: 'sender@example.com',
  websiteUrl: 'https://postguard.eu',         // optional
  unencryptedMessage: 'Encrypted via PostGuard', // optional
})

// envelope.subject       -- "PostGuard Encrypted Email"
// envelope.htmlBody      -- placeholder HTML with instructions + armored payload
// envelope.plainTextBody -- plain text fallback
// envelope.attachment    -- File object named "postguard.encrypted"
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `encrypted` | `Uint8Array` | Yes | The encrypted ciphertext |
| `from` | `string` | Yes | Sender email address |
| `websiteUrl` | `string` | No | URL to link in the placeholder body |
| `unencryptedMessage` | `string` | No | Unencrypted message shown in the placeholder |

### `EnvelopeResult`

```ts
interface EnvelopeResult {
  subject: string         // email subject line
  htmlBody: string        // placeholder HTML body with armored payload
  plainTextBody: string   // plain text fallback
  attachment: File        // ciphertext as "postguard.encrypted"
}
```

## `extractCiphertext()`

Extracts the encrypted ciphertext from a received email. It checks two locations in order:

1. Attachments: looks for a file named `postguard.encrypted`
2. HTML body: looks for an armored payload between `-----BEGIN POSTGUARD MESSAGE-----` and `-----END POSTGUARD MESSAGE-----` markers

Returns a `Uint8Array` with the ciphertext, or `null` if nothing is found.

```ts
const ciphertext = pg.email.extractCiphertext({
  htmlBody: emailHtmlBody,
  attachments: [
    { name: 'postguard.encrypted', data: attachmentArrayBuffer },
  ],
})

if (ciphertext) {
  const result = await pg.decrypt({
    data: ciphertext,
    session: mySessionCallback,
    recipient: 'alice@example.com',
  })
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `htmlBody` | `string` | No | The HTML body of the received email |
| `attachments` | `Array<{ name, data }>` | No | Email attachments (data as ArrayBuffer) |

## `injectMimeHeaders()`

Adds or replaces headers in a raw MIME string. The function splits the MIME at the `\r\n\r\n` separator, processes the header section (including folded multi-line headers), and reassembles the result.

```ts
const updatedMime = pg.email.injectMimeHeaders(
  rawMimeString,
  {
    'X-PostGuard': 'encrypted',
    'Subject': 'PostGuard Encrypted Email',
  },
  ['Subject']  // headers to remove before injecting
)
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mime` | `string` | Yes | The raw MIME string |
| `headersToInject` | `Record<string, string>` | Yes | Headers to add |
| `headersToRemove` | `string[]` | No | Headers to remove first |

## Full Encryption Workflow

Here is the complete email encryption workflow as used by the Thunderbird addon:

```ts
import { PostGuard } from '@e4a/pg-js'

const pg = new PostGuard({
  pkgUrl: 'https://pkg.example.com',
})

// 1. Build the inner MIME message
const mimeData = pg.email.buildMime({
  from: 'sender@example.com',
  to: ['alice@example.com'],
  subject: 'Confidential Report',
  htmlBody: '<p>Please see the attached report.</p>',
  attachments: [
    { name: 'report.pdf', type: 'application/pdf', data: pdfBuffer },
  ],
})

// 2. Encrypt the MIME bytes
const ciphertext = await pg.encrypt({
  sign: pg.sign.session(mySessionCallback, {
    senderEmail: 'sender@example.com',
  }),
  recipients: [pg.recipient.email('alice@example.com')],
  data: mimeData,
})

// 3. Create the encrypted email envelope
const envelope = pg.email.createEnvelope({
  encrypted: ciphertext,
  from: 'sender@example.com',
})

// 4. Send using your email client/API
// Use: envelope.subject, envelope.htmlBody, envelope.attachment
```

## Full Decryption Workflow

```ts
// 1. Extract ciphertext from the received email
const ciphertext = pg.email.extractCiphertext({
  htmlBody: receivedEmail.htmlBody,
  attachments: receivedEmail.attachments,
})

if (!ciphertext) {
  console.log('Not a PostGuard email')
  return
}

// 2. Decrypt
const result = await pg.decrypt({
  data: ciphertext,
  session: async (request) => {
    return await runYiviSession(request)
  },
  recipient: 'alice@example.com',
})

// 3. Parse the decrypted MIME
const mimeText = new TextDecoder().decode(result.plaintext)
// Parse mimeText with your preferred MIME parser (e.g. postal-mime)

// 4. Show sender identity
if (result.sender) {
  const email = result.sender.public.con.find(
    (a) => a.t === 'pbdf.sidn-pbdf.email.email'
  )
  console.log('Verified sender:', email?.v)
}
```

## Additional Utilities

The SDK also exports these lower-level email helpers:

```ts
import {
  extractArmoredPayload,  // extract armored block from HTML string
  armorBase64,            // wrap base64 string in BEGIN/END markers (76 chars/line)
  toUrlSafeBase64,        // convert base64 to URL-safe variant (+ → -, / → _, strip =)
} from '@e4a/pg-js'
```

## Standalone Exports

All email helpers are also available as standalone function exports:

```ts
import {
  buildMime,
  injectMimeHeaders,
  createEnvelope,
  extractCiphertext,
  extractArmoredPayload,
  armorBase64,
  toUrlSafeBase64,
} from '@e4a/pg-js'
```

These are identical to the `pg.email.*` methods and can be used without a `PostGuard` instance.
