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
      text: Getting Started
      link: /guide/getting-started

features:
  - title: No key exchange needed
    details: Encrypt data using nothing more than the recipient's email address. There are no public keys to look up and no certificates to manage.
  - title: Identity verification built in
    details: Recipients prove they own their email address (or other attributes) before they can decrypt. Sender identity can be verified too.
  - title: Time-limited keys
    details: Decryption keys expire automatically. Even if a key is compromised, it only works for a specific time window.
  - title: Works everywhere
    details: The JavaScript SDK runs in browsers and Node.js. Addons exist for Thunderbird and Outlook. A CLI tool handles server-side and scripting use cases.
---

## Quick Start

Install the SDK:

```bash
npm install @e4a/pg-js @e4a/pg-wasm
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

Read the [concepts guide](/guide/concepts) to understand how this works, or jump straight to [getting started](/guide/getting-started).
