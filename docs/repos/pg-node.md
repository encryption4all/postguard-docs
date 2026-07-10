# pg-node

[GitHub](https://github.com/encryption4all/postguard-examples/tree/main/pg-node) · JavaScript · Node.js Example

A plain Node.js CLI example showing how to use [`@e4a/pg-js`](/repos/postguard-js) from a server runtime. Part of the [postguard-examples](https://github.com/encryption4all/postguard-examples) repository.

Mirrors the [pg-sveltekit](/repos/pg-sveltekit) "Informatierijk notificeren" flow (citizen exact-email recipient + organisation email-domain recipient) as a CLI script.

It shows two modes:

1. **Encrypt and Send**: Encrypts the input files for both recipients, uploads to Cryptify, and asks Cryptify to email each recipient a download link.
2. **Encrypt and Upload**: Same upload, but silent. Cryptify returns a UUID you can distribute through some other channel.

## Prerequisites

- **Node.js 22+**, matching the example's `engines.node`. The SDK itself supports Node 20.3+, Bun, and Deno (see [postguard-js > Server-side usage](/repos/postguard-js#server-side-usage)).
- A PostGuard for Business API key.

## Setup

```bash
cd pg-node
npm install
cp .env.example .env
# edit .env: set at minimum PG_API_KEY
```

Run one of the two modes:

```bash
npm run send       # encrypt + upload + ask Cryptify to send mails
npm run upload     # encrypt + upload silently, no mails
```

The script prints the resulting `uuid` and the corresponding `/download?uuid=...` URL.

## Configuration

| Variable                | Description                                           | Default                                                                            |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `PG_API_KEY`            | PostGuard for Business API key (`PG-...`)             | *(required)*                                                                       |
| `PG_PKG_URL`            | PostGuard PKG server URL                              | `https://pkg.staging.postguard.eu`                                                 |
| `PG_CRYPTIFY_URL`       | Cryptify file-sharing URL                             | `https://storage.staging.postguard.eu`                                             |
| `PG_DOWNLOAD_URL`       | PostGuard website used in `/download` URLs            | `https://staging.postguard.eu` on staging Cryptify, else `https://postguard.eu`    |
| `PG_CITIZEN_EMAIL`      | Citizen recipient (exact email match)                 | `citizen@example.com`                                                              |
| `PG_ORGANISATION_EMAIL` | Organisation recipient (matches by domain)            | `noreply@example.org`                                                              |
| `PG_MESSAGE`            | Optional unencrypted body for Cryptify's notify mail  | *(empty)*                                                                          |
| `PG_INPUT_FILES`        | Comma-separated file paths to encrypt                 | two in-memory demo files                                                           |

The default `PG_CRYPTIFY_URL` is the staging deployment. Staging Cryptify does not actually deliver notification emails, so `npm run send` succeeds without spamming real inboxes while you integrate. The upload still returns a real UUID and the download URL is usable.

## How it maps to the SDK

The encryption code lives in `src/encryption.mjs`. The send mode passes a `notify` object to opt into Cryptify-sent emails:

```js
const sealed = pg.encrypt({
  files,
  recipients: [
    pg.recipient.email(citizen.email),
    pg.recipient.emailDomain(organisation.email),
  ],
  sign: pg.sign.apiKey(apiKey),
  onProgress,
  signal,
});

const result = await sealed.upload({
  notify: {
    recipients: true,
    message: message || undefined,
    language: 'EN',
  },
});
```

<small>[Source: encryption.mjs#L13-L40](https://github.com/encryption4all/postguard-examples/blob/0fb7789560595d29d28fcf4222e67dc1ab887c2e/pg-node/src/encryption.mjs#L13-L40)</small>

The upload mode calls `sealed.upload()` with no options. The upload is silent by default; pass `notify` only when you want Cryptify to send the recipient mail. See [JS SDK > Notify options](/sdk/js-encryption#notify-options) for the full shape.
