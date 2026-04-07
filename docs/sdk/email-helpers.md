# Email Helpers

The SDK includes email helper methods for building and parsing PostGuard-encrypted emails. These are available both as instance methods on `pg.email.*` and as standalone exports. All examples below come from the [Thunderbird addon](https://github.com/encryption4all/postguard-tb-addon).

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

The Thunderbird addon builds the inner MIME from compose details:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{348-360 ts}

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

The Thunderbird addon creates the envelope and attaches it:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{403-410 ts}

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `encrypted` | `Uint8Array` | Yes | The encrypted ciphertext |
| `from` | `string` | Yes | Sender email address |
| `websiteUrl` | `string` | No | URL to link in the placeholder body |
| `unencryptedMessage` | `string` | No | Unencrypted message shown in the placeholder |

## `extractCiphertext()`

Extracts the encrypted ciphertext from a received email. It checks two locations in order:

1. Attachments: looks for a file named `postguard.encrypted`
2. HTML body: looks for an armored payload between `-----BEGIN POSTGUARD MESSAGE-----` and `-----END POSTGUARD MESSAGE-----` markers

Returns a `Uint8Array` with the ciphertext, or `null` if nothing is found.

<<< @/snippets/postguard-tb-addon/src/background/background.ts{713-716 ts}

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `htmlBody` | `string` | No | The HTML body of the received email |
| `attachments` | `Array<{ name, data }>` | No | Email attachments (data as ArrayBuffer) |

## `injectMimeHeaders()`

Adds or replaces headers in a raw MIME string. The function splits the MIME at the `\r\n\r\n` separator, processes the header section (including folded multi-line headers), and reassembles the result.

The Thunderbird addon injects threading headers and an `X-PostGuard` marker into decrypted messages:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{752-771 ts}

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mime` | `string` | Yes | The raw MIME string |
| `headersToInject` | `Record<string, string>` | Yes | Headers to add |
| `headersToRemove` | `string[]` | No | Headers to remove first |

## Full Encryption Workflow

The Thunderbird addon's `handleBeforeSend` function shows the complete email encryption workflow: build MIME, encrypt, create envelope, and replace the email content:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{284-431 ts}

## Full Decryption Workflow

The decryption handler extracts ciphertext, decrypts, builds identity badges, injects headers, and imports the decrypted message back into the folder:

<<< @/snippets/postguard-tb-addon/src/background/background.ts{680-806 ts}
