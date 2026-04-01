# Core Concepts

This page explains the ideas and components that make PostGuard work. No prior knowledge of cryptography or identity systems is assumed.

## Identity-Based Encryption (IBE)

In traditional encryption (like PGP or S/MIME), every user generates a **key pair**: a public key for encryption and a private key for decryption. The sender must find the recipient's public key before they can encrypt anything.

Identity-Based Encryption flips this around. Instead of generating a random key pair, the recipient's **identity** (such as their email address) serves directly as their public key. Anyone who knows the email address can encrypt for that person immediately.

The private key (the decryption key) does not exist ahead of time. It is generated on demand by a trusted server called the PKG (more on this below), but only after the recipient proves they own the identity.

```
Traditional encryption:
  Sender looks up recipient's public key --> encrypts --> sends
  Recipient uses their private key --> decrypts

Identity-Based Encryption:
  Sender uses recipient's email address + Master Public Key --> encrypts --> sends
  Recipient proves identity --> receives decryption key from PKG --> decrypts
```

::: info Why is this better?
The sender never needs to look anything up or coordinate with the recipient. Encryption is a one-step operation that only requires knowing the recipient's email address.
:::

## PKG (Private Key Generator)

The PKG is a trusted server that sits at the center of the PostGuard system. It has two jobs:

1. **Publish the Master Public Key (MPK)** -- a system-wide parameter that anyone can fetch. Senders combine this with the recipient's email address to encrypt data.
2. **Issue User Secret Keys (USKs)** -- per-recipient decryption keys. When a recipient proves their identity, the PKG derives a USK from its Master Secret Key and hands it to the recipient.

The PKG holds a **master key pair**:
- **Master Public Key (MPK)**: Public. Distributed to all senders. Used during encryption.
- **Master Secret Key (MSK)**: Secret. Never leaves the PKG. Used to derive USKs.

::: warning Trust model
The PKG can theoretically derive a decryption key for any identity, so it must be operated by a trusted party. This is the fundamental trade-off of IBE: you trade the inconvenience of key exchange for trust in the PKG operator.
:::

## Yivi

Yivi is a **privacy-preserving identity app** that runs on the recipient's smartphone. It acts as a digital wallet that holds verified identity attributes (email address, phone number, name, age, organization membership, and more).

When a recipient needs to decrypt a PostGuard message, they must prove they own the email address the message was encrypted for. Here is how the flow works:

1. The client application displays a **QR code** (or, on mobile, a deep link).
2. The recipient scans the QR code with their Yivi app.
3. The Yivi app presents a **disclosure request**: "This service asks you to share your email address."
4. The recipient approves the request in the Yivi app.
5. Yivi sends a **cryptographic proof** to the PKG, proving the recipient owns the email without revealing anything else.
6. The PKG verifies the proof and issues the decryption key.

::: tip Privacy by design
Yivi uses zero-knowledge proofs. The recipient only shares the specific attributes that are requested -- nothing more. If a message requires proof of email, Yivi shares the email and nothing else. The PKG never sees the recipient's name, phone number, or any other attribute unless the policy explicitly requires it.
:::

Yivi attributes come from trusted **issuers**. For example, SIDN (the Dutch domain name registry) issues verified email attributes. When you add your email to Yivi, SIDN sends a confirmation email to prove you own the address and then signs the attribute cryptographically.

## Cryptify

Cryptify is an **optional file hosting service** for PostGuard-encrypted files. It provides:

- **Encrypted file storage** -- upload encrypted files and receive a UUID link
- **Email notifications** -- optionally notify recipients that an encrypted file is waiting for them
- **Chunked uploads** -- large files are uploaded in chunks with progress tracking

You do not need Cryptify to use PostGuard. You can encrypt data with the SDK and deliver the ciphertext however you like (email attachment, your own storage, etc.). Cryptify is a convenience for applications that need file sharing out of the box.

```
With Cryptify:
  Sender encrypts files --> uploads to Cryptify --> recipient gets link
  Recipient visits link --> proves identity via Yivi --> downloads decrypted files

Without Cryptify:
  Sender encrypts data with SDK --> delivers ciphertext however they want
  Recipient receives ciphertext --> proves identity via Yivi --> decrypts locally
```

## Policy

A **policy** defines what identity attributes a recipient must prove in order to decrypt a message. The simplest policy requires just an email address:

```json
{
  "con": [
    { "t": "pbdf.sidn-pbdf.email.email", "v": "alice@example.com" }
  ]
}
```

This means: "Only someone who can prove they own `alice@example.com` can decrypt this message."

But policies can be more expressive. You can require multiple attributes:

```json
{
  "con": [
    { "t": "pbdf.sidn-pbdf.email.email", "v": "alice@example.com" },
    { "t": "pbdf.gemeente.personalData.fullname" }
  ]
}
```

This means: "The recipient must prove they own `alice@example.com` AND disclose their full name."

You can also encrypt for anyone at a domain:

```json
{
  "con": [
    { "t": "pbdf.sidn-pbdf.email.domain", "v": "example.com" }
  ]
}
```

This means: "Anyone with a verified `@example.com` email address can decrypt."

The SDK provides helper methods that build these policies automatically:

```typescript
// Encrypt for a specific email
pg.recipient.email('alice@example.com')

// Encrypt for anyone at a domain
pg.recipient.emailDomain('alice@example.com')  // uses the domain part

// Encrypt with a custom policy
pg.recipient.withPolicy('alice@example.com', [
  { t: 'pbdf.sidn-pbdf.email.email', v: 'alice@example.com' },
  { t: 'pbdf.gemeente.personalData.fullname', v: '' },
])
```

::: info Attribute types
Attribute identifiers like `pbdf.sidn-pbdf.email.email` follow the Yivi attribute scheme. `pbdf` is the scheme, `sidn-pbdf` is the issuer, `email` is the credential, and the final `email` is the specific attribute within that credential.
:::

## Timestamps

Decryption keys in PostGuard are **time-limited**. When the sender encrypts a message, the current timestamp is embedded in the ciphertext. When the recipient requests a decryption key, the PKG issues a key that is only valid for a specific time window.

By default, keys are valid **until 4:00 AM the next day**. This means:

- A message encrypted at 10:00 AM on Monday can be decrypted until 4:00 AM on Tuesday.
- After that, the recipient must request a new key from the PKG (by proving their identity again).

This design provides **forward security**: even if a decryption key is compromised, it only works for messages encrypted during that specific time window, not for past or future messages.

::: tip Why 4 AM?
The 4 AM boundary is chosen so that keys remain valid through the end of a typical workday and into the evening, while still expiring overnight. The SDK calculates this automatically via the `secondsTill4AM()` utility.
:::

## Signing

PostGuard supports **sender signing** so the recipient can verify who sent an encrypted message. Without signing, an attacker could encrypt a message for a victim while pretending to be someone else.

There are two ways to sign:

### Yivi signing (peer-to-peer)
The sender proves their email address via Yivi, just like the recipient does during decryption. The PKG issues signing keys tied to the sender's verified identity. The sender's identity is embedded in the encrypted output.

### API key signing (PostGuard for Business)
For automated or server-side encryption, an API key replaces the Yivi step. The organization operating the sender's application is trusted to authenticate the sender through its own mechanisms.

When the recipient decrypts, the SDK returns a `sender` object containing the verified identity attributes of the sender (if signing was used). This lets the recipient's application display who sent the message and whether the signature is valid.

```typescript
const result = await pg.decrypt({ data: ciphertext })

if (result.sender) {
  console.log('Sent by:', result.sender.public.con)
  // e.g. [{ t: 'pbdf.sidn-pbdf.email.email', v: 'bob@example.com' }]
} else {
  console.log('Unsigned -- sender identity unknown')
}
```

## Next steps

Now that you understand the concepts, see the [architecture overview](/guide/architecture) to learn how these components connect and communicate.
