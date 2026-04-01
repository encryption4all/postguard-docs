# Email Helpers

The SDK includes a set of email helper methods for building and parsing PostGuard-encrypted emails. These are available both as instance methods on `pg.email.*` and as standalone exports.

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

Constructs a MIME message from structured input. Returns the raw MIME bytes as a `Uint8Array`.

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
| `attachments` | `Array<{ name, type, data }>` | No | File attachments |

::: tip
Provide at least one of `htmlBody` or `plainTextBody`. If both are provided, the MIME message will include both as a `multipart/alternative` section.
:::

## `createEnvelope()`

Takes encrypted bytes and wraps them into an email envelope structure. The envelope contains a placeholder HTML body (informing the recipient to use PostGuard to decrypt), a plain text fallback, and the ciphertext as a file attachment.

```ts
const envelope = pg.email.createEnvelope({
  encrypted: ciphertext,     // Uint8Array from pg.encrypt()
  from: 'sender@example.com',
  websiteUrl: 'https://postguard.eu',         // optional
  unencryptedMessage: 'Encrypted via PostGuard', // optional
})

// envelope.subject       -- "PostGuard Encrypted Email" (or similar)
// envelope.htmlBody      -- placeholder HTML with instructions
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
  htmlBody: string        // placeholder HTML body
  plainTextBody: string   // plain text fallback
  attachment: File        // ciphertext as "postguard.encrypted"
}
```

## `extractCiphertext()`

Extracts the encrypted ciphertext from a received email. It checks two locations:

1. **Attachments** -- looks for a file named `postguard.encrypted`
2. **HTML body** -- looks for an armored (base64-encoded) payload embedded in the HTML

Returns `null` if no ciphertext is found.

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
| `attachments` | `Array<{ name, data }>` | No | Email attachments |

## `injectMimeHeaders()`

Adds or replaces headers in a raw MIME string. Useful for injecting PostGuard-specific headers or threading information after encryption.

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

Here is the complete email encryption workflow as used in the Thunderbird addon:

```ts
import { PostGuard } from '@e4a/pg-js'

const pg = new PostGuard({
  pkgUrl: 'https://pkg.postguard.eu',
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
// envelope.subject, envelope.htmlBody, envelope.attachment
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
// Parse mimeText with your preferred MIME parser

// 4. Show sender identity
if (result.sender) {
  const email = result.sender.public.con.find(
    (a) => a.t === 'pbdf.sidn-pbdf.email.email'
  )
  console.log('Verified sender:', email?.v)
}
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
} from '@e4a/pg-js'
```

These are identical to the `pg.email.*` methods and can be used without a `PostGuard` instance.
