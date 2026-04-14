# postguard-js

[GitHub](https://github.com/encryption4all/postguard-js) · TypeScript · JavaScript/TypeScript SDK

The official PostGuard SDK for browsers and Node.js. Published as `@e4a/pg-js` on npm.

PostGuard encrypts data for recipients based on their identity attributes (email address, phone number, etc.) rather than traditional public keys. Recipients prove their identity via Yivi to decrypt. No key exchange or certificates needed.

## Installation

```bash
npm install @e4a/pg-js
```

Optional peer dependencies for Yivi web UI integration:

```bash
npm install @privacybydesign/yivi-core @privacybydesign/yivi-client @privacybydesign/yivi-web
```

These are not needed when using API key signing or custom session callbacks.

## Quick Start

```ts
import { PostGuard } from '@e4a/pg-js';

const pg = new PostGuard({
  pkgUrl: 'https://pkg.staging.yivi.app',
  cryptifyUrl: 'https://fileshare.staging.yivi.app', // optional, for file upload flows
  headers: { 'X-My-Client': 'v1.0' },                // optional
});
```

## Architecture

The SDK uses a lazy builder pattern. `pg.encrypt()` and `pg.open()` return builder objects that capture parameters but do no work. The actual operation runs when you call a terminal method.

```ts
// Encrypt: nothing happens until .upload() or .toBytes()
const sealed = pg.encrypt({ files, recipients, sign });
await sealed.upload();                                // encrypt + stream to Cryptify
await sealed.upload({ notify: { message: 'Hi' } });  // + email notification
const bytes = await sealed.toBytes();                 // encrypt + buffer in memory

// Decrypt: nothing happens until .inspect() or .decrypt()
const opened = pg.open({ uuid });
const info = await opened.inspect();                  // peek at recipients and sender
const result = await opened.decrypt({ element: '#yivi-web' });
result.download();
```

## Encryption

### Encrypt files and upload to Cryptify

```ts
const sealed = pg.encrypt({
  sign: pg.sign.apiKey('your-api-key'),
  recipients: [pg.recipient.email('bob@example.com')],
  files: fileList,
  onProgress: (pct) => console.log(`${pct}%`),
  signal: abortController.signal,
});

// Upload only (returns UUID for custom delivery)
const { uuid } = await sealed.upload();

// Upload and have Cryptify send email notifications
const { uuid } = await sealed.upload({
  notify: { message: 'Here are your documents.', language: 'EN' },
});
```

### Encrypt raw data (no upload)

For email clients and custom integrations that handle their own transport:

```ts
const sealed = pg.encrypt({
  sign: pg.sign.apiKey('your-api-key'),
  recipients: [pg.recipient.email('bob@example.com')],
  data: myDataBytes, // Uint8Array or ReadableStream
});

const encrypted = await sealed.toBytes();
// encrypted is a Uint8Array
```

## Decryption

### Inspect before decrypt

```ts
const opened = pg.open({ uuid: 'the-file-uuid' });
const info = await opened.inspect();
// info.recipients: ['bob@example.com']
// info.sender: { email: 'alice@example.com', attributes: [...] }
```

### Decrypt from Cryptify UUID (Yivi web)

```ts
const opened = pg.open({ uuid: 'the-file-uuid' });
const result = await opened.decrypt({
  element: '#yivi-popup',
  recipient: 'bob@example.com', // optional hint
  enableCache: true,            // cache JWT for repeated decryptions
});

result.download('decrypted-files.zip');
console.log('Sender:', result.sender);
```

### Decrypt raw data

```ts
const opened = pg.open({ data: encryptedBytes });
const result = await opened.decrypt({
  element: '#yivi-popup',
  recipient: 'bob@example.com',
});
// result.plaintext is a Uint8Array
// result.sender contains verified sender identity
```

## Signing Methods

```ts
// Business API key (server-side)
pg.sign.apiKey('your-api-key')

// Yivi web session (browser, inline QR code)
pg.sign.yivi({
  element: '#yivi-popup',
  senderEmail: 'alice@example.com',
  attributes: [
    { t: 'pbdf.gemeente.personalData.fullname', optional: true },
    { t: 'pbdf.sidn-pbdf.mobilenumber.mobilenumber', optional: true },
  ],
  includeSender: true,
})

// Custom session callback (email addons, mobile apps, etc.)
pg.sign.session(
  async ({ con, sort }) => {
    return await myCustomYiviFlow(con, sort);
  },
  { senderEmail: 'alice@example.com' }
)
```

## Recipients

```ts
// Encrypt for an exact email address
pg.recipient.email('bob@example.com')

// Encrypt for anyone with an email at a domain
pg.recipient.emailDomain('bob@example-org.com')

// Require extra attributes (fluent chaining)
pg.recipient.email('bob@example.com')
  .extraAttribute('pbdf.gemeente.personalData.surname', 'Smith')
  .extraAttribute('pbdf.sidn-pbdf.mobilenumber.mobilenumber', '0612345678')
```

## Email Integration

For email clients (Thunderbird, Outlook, etc.) that need to encrypt/decrypt email bodies:

```ts
import { buildMime, extractCiphertext, injectMimeHeaders } from '@e4a/pg-js';

// Build inner MIME message
const mime = buildMime({
  from: 'alice@example.com',
  to: ['bob@example.com'],
  subject: 'Hello',
  htmlBody: '<p>Secret message</p>',
  attachments: [{ name: 'doc.pdf', type: 'application/pdf', data: pdfBuffer }],
});

// Encrypt and create email envelope
const sealed = pg.encrypt({
  sign: pg.sign.yivi({ element: '#yivi-popup', senderEmail: 'alice@example.com' }),
  recipients: [pg.recipient.email('bob@example.com')],
  data: mime,
});

const envelope = await pg.email.createEnvelope({ sealed, from: 'alice@example.com' });
// envelope.subject, envelope.htmlBody, envelope.plainTextBody, envelope.attachment

// On the receiving side: extract and decrypt
const ciphertext = extractCiphertext({
  htmlBody: emailBodyHtml,
  attachments: [{ name: 'postguard.encrypted', data: attachmentBuffer }],
});

const opened = pg.open({ data: ciphertext });
const result = await opened.decrypt({ element: '#yivi-popup', recipient: 'bob@example.com' });
```

## Error Handling

```ts
import {
  PostGuardError,
  NetworkError,
  YiviNotInstalledError,
  DecryptionError,
  IdentityMismatchError,
} from '@e4a/pg-js';

try {
  await sealed.upload();
} catch (err) {
  if (err instanceof IdentityMismatchError) {
    // Yivi attributes didn't match the encryption policy
  } else if (err instanceof YiviNotInstalledError) {
    // Yivi peer dependencies not installed
  } else if (err instanceof NetworkError) {
    console.log(err.status, err.body);
  }
}
```

## Development

### Prerequisites

- Node.js 20+

### Building

```bash
npm install
npm run prebuild  # Generate WASM base64
npm run build     # TypeScript build via tsdown
```

### Testing

```bash
npm run test      # Vitest
npm run typecheck # tsc
```

## Releasing

This repository uses [semantic-release](https://semantic-release.gitbook.io/) for automated npm publishing. Conventional commits on `main` trigger version bumps and releases automatically.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `integration.yml` | Push/PR | Type checking, build, tests |
| `delivery.yml` | Push to main | Integration checks then semantic-release |
