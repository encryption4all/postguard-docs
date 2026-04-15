# What is PostGuard?

PostGuard is an encryption system that lets you send encrypted messages and files to someone using only their identity attributes, such as an email address, name, or citizen service number (BSN). There is no need to exchange keys, install certificates, or coordinate with the recipient beforehand.

## The problem

Sending encrypted email or files today is painful. The two dominant standards, PGP and S/MIME, both require you to obtain the recipient's public key *before* you can encrypt anything. In practice:

PGP requires you to find the recipient's public key on a keyserver, verify its fingerprint, and manage a "web of trust." Most non-technical users never get past step one. S/MIME requires both sender and recipient to have certificates issued by a Certificate Authority. Certificates cost money, expire, and are tied to specific devices.

Both approaches put the burden on the user. If the recipient has not set things up in advance, you cannot send them an encrypted message.

## How PostGuard works

PostGuard uses Identity-Based Encryption (IBE). The recipient's identity *is* their public key. That identity can be any attribute held in a digital wallet: an email address, a name, a BSN, or any other verified attribute. There is nothing to look up or exchange.

PostGuard integrates with [Yivi](https://yivi.app) as the identity wallet today. It is designed to also support eIDAS wallets as they become available across the EU.

| | PGP | S/MIME | PostGuard (IBE) |
|---|---|---|---|
| Recipient setup required | Yes, generate and publish key pair | Yes, obtain certificate from CA | None |
| Sender needs recipient's key | Yes, keyserver lookup | Yes, certificate directory | No, identity attributes are the key |
| Certificate management | Manual (web of trust) | CA-issued certificates | No certificates |
| Identity verification | Manual fingerprint checking | Implicit via CA | Built-in via Yivi identity app |

## The flow at a high level

1. The sender encrypts a message using the recipient's identity attributes (e.g. email address) and a system-wide Master Public Key fetched from a trusted server called the PKG.
2. The recipient proves they own those attributes by completing an identity verification step using their wallet app (Yivi, or in the future an eIDAS wallet).
3. The PKG checks the proof and issues a time-limited decryption key that only works for that specific recipient and that specific time window.
4. The recipient uses the decryption key to read the message.

Encryption (step 1) happens *without any involvement from the recipient*. They only need to act when they want to decrypt.

::: tip Key takeaway
You can encrypt a message for someone who has never heard of PostGuard, has never installed any software, and has never generated any keys. They only need to verify their identity when they want to read the message.
:::

## What you can build with it

PostGuard is useful anywhere you need to send sensitive data to a specific person:

- Encrypted email: encrypt email content and attachments so only the intended recipient can read them. Addons for Thunderbird and Outlook handle this automatically.
- Secure file sharing: encrypt files and share them via a link. Only verified recipients can download.
- Attribute-based access control: encrypt data with policies that require any combination of wallet attributes (email, name, BSN, organization membership, and more).
- Backend-to-user encryption: a server encrypts data for a user without needing the user to register or create an account first.

## Available tools

| Tool | Description |
|------|-------------|
| `@e4a/pg-js` | JavaScript/TypeScript SDK for browsers and Node.js |
| `@e4a/pg-wasm` | WebAssembly module for encryption/decryption |
| `pg-cli` | Command-line tool for encrypting and decrypting files |
| `pg-pkg` | The PKG server (issues keys, verifies identity) |
| Thunderbird addon | End-to-end email encryption in Thunderbird 128+ |
| Outlook addon | End-to-end email encryption in Outlook |
| PostGuard website | Web application for file encryption and sharing |

## Next steps

- Learn the [core concepts](/guide/concepts) behind PostGuard: IBE, the PKG, Yivi, policies, and timestamps
- See the full [system architecture](/guide/architecture) to understand how the components fit together
- Jump to [getting started](/sdk/getting-started) to install the SDK and encrypt your first message
