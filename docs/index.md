---
layout: home

hero:
  name: PostGuard
  text: Encryption based on identity, not keys
  tagline: Send encrypted messages and files to anyone using just their email address. No key exchange, no certificates, no hassle.
  actions:
    - theme: brand
      text: What is PostGuard?
      link: /guide/what-is-postguard
    - theme: alt
      text: Core Concepts
      link: /guide/concepts
    - theme: alt
      text: Architecture
      link: /guide/architecture

features:
  - title: No key exchange needed
    details: Encrypt data using nothing more than the recipient's email address. There are no public keys to look up, no certificates to manage.
  - title: Identity verification built in
    details: Recipients prove they own their email address before they can decrypt. Sender identity can be verified too, so you always know who sent the message.
  - title: Time-limited keys
    details: Decryption keys expire automatically, giving you control over how long encrypted data remains accessible.
  - title: Works everywhere
    details: The SDK runs in browsers and Node.js. Integrate PostGuard into web apps, email clients, or backend services.
---

## Quick Start

Install the SDK:

```bash
npm install @e4a/pg-js
```

Create a client and encrypt:

```typescript
import { PostGuard } from '@e4a/pg-js'

const pg = new PostGuard({
  pkgUrl: 'https://pkg.example.com',
})

const encrypted = await pg.encrypt({
  sign: pg.sign.apiKey('your-api-key'),
  recipients: [pg.recipient.email('alice@example.com')],
  data: new TextEncoder().encode('Hello, Alice!'),
})
```

Read the [concepts guide](/guide/concepts) to understand how this works under the hood, or jump to the [architecture overview](/guide/architecture) to see all the moving parts.
