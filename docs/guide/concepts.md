# Core Concepts

This page explains the ideas and components that make PostGuard work.

## Identity-Based Encryption (IBE)

In traditional encryption (like PGP or S/MIME), every user generates a key pair: a public key for encryption and a private key for decryption. The sender must find the recipient's public key before they can encrypt anything.

Identity-Based Encryption flips this around. The recipient's identity is their public key. That identity can be any verified attribute from a digital wallet: an email address, a name, a BSN (citizen service number), or any other attribute. Anyone who knows the attribute can encrypt for that person immediately.

The private key (the decryption key) does not exist ahead of time. It is generated on demand by a trusted server called the PKG, but only after the recipient proves they own the identity.

```
Traditional encryption:
  Sender looks up recipient's public key --> encrypts --> sends
  Recipient uses their private key --> decrypts

Identity-Based Encryption:
  Sender uses recipient's email address + Master Public Key --> encrypts --> sends
  Recipient proves identity --> receives decryption key from PKG --> decrypts
```

::: info No coordination needed
The sender never needs to look anything up or coordinate with the recipient. Encryption only requires knowing a recipient's identity attribute and the system-wide Master Public Key.
:::

### Cryptographic details

PostGuard uses the CGW Anonymous IBE scheme (variant CGWKV) with multi-recipient key encapsulation (MKEM), built on the BLS12-381 elliptic curve. This provides approximately 120-bit security. Identities are derived by hashing policies (attribute types, values, and a timestamp) with SHA3-512 using domain separation.

Symmetric encryption uses AES-128-GCM (matching the BLS12-381 security level). The SDK supports both in-memory and streaming encryption, with streaming using 256 KiB chunks by default.

## PKG (Private Key Generator)

The PKG is a trusted server at the center of the PostGuard system. It has two jobs:

1. Publish the Master Public Key (MPK): a system-wide parameter that anyone can fetch. Senders combine this with the recipient's identity to encrypt data.
2. Issue User Secret Keys (USKs): per-recipient decryption keys. When a recipient proves their identity, the PKG derives a USK from its Master Secret Key and hands it to the recipient.

The PKG holds a master key pair:
- Master Public Key (MPK): public, distributed to all senders, used during encryption.
- Master Secret Key (MSK): secret, never leaves the PKG, used to derive USKs.

The PKG also manages Identity-Based Signatures (IBS) using the GG scheme. This lets senders sign encrypted data so that recipients can verify who sent the message.

::: warning Trust model
The PKG can derive a decryption key for any identity, so it must be operated by a trusted party. This is the fundamental trade-off of IBE: you trade the inconvenience of key exchange for trust in the PKG operator.
:::

## Yivi

PostGuard encrypts based on identity attributes held in a digital wallet. Today it integrates with Yivi, and in the future it will support eIDAS wallets as they roll out across the EU.

### What is Yivi?

Yivi is a privacy-preserving identity app that runs on the recipient's smartphone. It acts as a digital wallet holding verified identity attributes: email address, phone number, name, BSN, age, organization membership, and more.

Yivi attributes come from trusted issuers. For example, SIDN (the Dutch domain name registry) issues verified email attributes. When you add your email to Yivi, SIDN sends a confirmation email to prove you own the address, then signs the attribute cryptographically.

### eIDAS wallets

The EU's eIDAS 2.0 regulation will give every EU citizen a digital identity wallet. PostGuard is designed to work with any such wallet. Once eIDAS wallets become available, recipients can decrypt PostGuard messages using their government-issued wallet instead of (or in addition to) Yivi.

### Verification flow

When a recipient needs to decrypt a PostGuard message, they must prove they own the attributes the message was encrypted for:

1. The client application displays a QR code (or, on mobile, a deep link).
2. The recipient scans the QR code with their Yivi app.
3. The wallet app presents a disclosure request: "This service asks you to share your email address."
4. The recipient approves the request in their wallet app.
5. The wallet sends a cryptographic proof to the PKG, proving the recipient owns the required attributes without revealing anything else.
6. The PKG verifies the proof and issues the decryption key.

::: tip Privacy by design
Yivi uses zero-knowledge proofs. The recipient only shares the specific attributes that are requested. If a message requires proof of email, Yivi shares the email and nothing else.
:::

## Cryptify

Cryptify is an optional file hosting service for PostGuard-encrypted files. It provides encrypted file storage with UUID links, optional email notifications to recipients, and chunked uploads with progress tracking.

You do not need Cryptify to use PostGuard. You can encrypt data with the SDK and deliver the ciphertext however you like (email attachment, your own storage, API response, etc.). Cryptify is a convenience for applications that need file sharing out of the box.

```
With Cryptify:
  Sender encrypts files --> uploads to Cryptify --> recipient gets link
  Recipient visits link --> proves identity via Yivi --> downloads decrypted files

Without Cryptify:
  Sender encrypts data with SDK --> delivers ciphertext their own way
  Recipient receives ciphertext --> proves identity via Yivi --> decrypts locally
```

## Policy

A policy defines what identity attributes a recipient must prove to decrypt a message. The simplest policy requires just an email address:

```json
{
  "con": [
    { "t": "pbdf.sidn-pbdf.email.email", "v": "alice@example.com" }
  ]
}
```

This means: "Only someone who can prove they own `alice@example.com` can decrypt this message."

You can also encrypt for anyone at a domain:

```json
{
  "con": [
    { "t": "pbdf.sidn-pbdf.email.domain", "v": "example.com" }
  ]
}
```

Policies can combine multiple attributes:

```json
{
  "con": [
    { "t": "pbdf.sidn-pbdf.email.email", "v": "alice@example.com" },
    { "t": "pbdf.gemeente.personalData.fullname" }
  ]
}
```

This means: "The recipient must prove they own `alice@example.com` AND disclose their full name."

### Common attribute types

| Attribute identifier | Description |
|---------------------|-------------|
| `pbdf.sidn-pbdf.email.email` | Email address |
| `pbdf.sidn-pbdf.email.domain` | Email domain |
| `pbdf.gemeente.personalData.fullname` | Full name (from municipality) |
| `pbdf.gemeente.personalData.bsn` | BSN (citizen service number) |
| `pbdf.gemeente.personalData.dateofbirth` | Date of birth |
| `pbdf.sidn-pbdf.mobilenumber.mobilenumber` | Mobile phone number |

The SDK provides helper methods that build these policies automatically. The SvelteKit example uses `pg.recipient.email()` and `pg.recipient.emailDomain()`:

```ts
const sealed = pg.encrypt({
  files,
  recipients: [
    pg.recipient.email(citizen.email),
    pg.recipient.emailDomain(organisation.email)
  ],
  sign: pg.sign.apiKey(apiKey),
});
```

<small>[Source: encryption.ts#L26-L35](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/src/lib/postguard/encryption.ts#L26-L35)</small>

You can require extra attributes beyond email using `.extraAttribute()`:

```ts
pg.recipient.email('alice@example.com')
  .extraAttribute('pbdf.gemeente.personalData.surname', 'Smith')
  .extraAttribute('pbdf.sidn-pbdf.mobilenumber.mobilenumber', '0612345678')
```

::: info Attribute identifiers
Attribute identifiers like `pbdf.sidn-pbdf.email.email` follow the Yivi attribute scheme. `pbdf` is the scheme, `sidn-pbdf` is the issuer, `email` is the credential, and the final `email` is the specific attribute within that credential.
:::

## Timestamps

Decryption keys in PostGuard are time-limited. When the sender encrypts a message, the current timestamp is embedded in the ciphertext. When the recipient requests a decryption key, the PKG issues a key that is only valid for a specific time window.

By default, keys are valid until 4:00 AM the next day. This means:

- A message encrypted at 10:00 AM on Monday can be decrypted until 4:00 AM on Tuesday.
- After that, the recipient must request a new key from the PKG (by proving their identity again).

This design provides forward security: even if a decryption key is compromised, it only works for messages encrypted during that specific time window.

::: tip Why 4 AM?
The 4 AM boundary keeps keys valid through the end of a typical workday and into the evening, while still expiring overnight. The SDK calculates this automatically via the `secondsTill4AM()` utility.
:::

## Signing

PostGuard supports sender signing so the recipient can verify who sent an encrypted message. Without signing, an attacker could encrypt a message for a victim while pretending to be someone else.

PostGuard uses Identity-Based Signatures (IBS, specifically the GG scheme) with two levels:

### Yivi signing (peer-to-peer)
The sender proves their email address via Yivi, just like the recipient does during decryption. The PKG issues signing keys tied to the sender's verified identity. The sender's identity is embedded in the encrypted output. This includes both a public signing key (visible attributes like email) and an optional private signing key (attributes only visible after decryption).

### API key signing (PostGuard for Business)
For automated or server-side encryption, an API key replaces the Yivi step. The organization operating the sender's application is trusted to authenticate the sender through its own mechanisms.

When the recipient decrypts, the SDK returns a `sender` field with type `FriendlySender` containing the verified identity attributes of the sender. The Thunderbird addon extracts sender attributes to build identity badges:

```ts
// Build badges from sender identity (FriendlySender format)
const sender = result.sender;
const badges = (sender?.attributes ?? []).map(
  ({ type: t, value: v }) => ({
    type: typeToImage(t),
    value: v ?? "",
  })
);
```

<small>[Source: background.ts#L725-L732](https://github.com/encryption4all/postguard-tb-addon/blob/26b8433efc8997bc1fe614f532caf17fb94b4a70/src/background/background.ts#L725-L732)</small>

## Wire format

PostGuard ciphertext uses a binary format with three parts:

```
PREAMBLE (10 bytes)
  4-byte magic: [0x14, 0x8A, 0x8E, 0xA7]
  2-byte version (current: V3 = 0x0002)
  4-byte header length

HEADER (variable)
  Per-recipient ciphertext and hidden policies
  Header signature

PAYLOAD (variable)
  AES-128-GCM encrypted content
  (includes message signature for authentication)
```

The header contains one entry per recipient, each with the recipient's hidden policy (attribute types visible, values redacted) and a multi-recipient ciphertext. The payload contains the actual encrypted data with a sign-then-encrypt composition.

## Next steps

Now that you understand the concepts, see the [architecture overview](/guide/architecture) to learn how these components connect and communicate.
