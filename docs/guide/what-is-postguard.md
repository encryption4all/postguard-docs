# What is PostGuard?

PostGuard is an encryption system that lets you send encrypted messages and files to someone using only their email address. There is no need to exchange keys, install certificates, or coordinate with the recipient beforehand.

## The problem

Sending encrypted email or files today is painful. The two dominant standards -- PGP and S/MIME -- both require you to obtain the recipient's public key *before* you can encrypt anything. In practice, this means:

- **PGP**: You need to find the recipient's public key on a keyserver, verify its fingerprint, and manage a "web of trust." Most non-technical users never get past step one.
- **S/MIME**: Both sender and recipient need certificates issued by a Certificate Authority. Certificates cost money, expire, and are tied to specific devices.

Both approaches put the burden on the user. If the recipient has not set things up in advance, you simply cannot send them an encrypted message.

## How PostGuard is different

PostGuard uses a technique called **Identity-Based Encryption (IBE)**. The core idea is simple: the recipient's identity (their email address) *is* their public key. There is nothing to look up or exchange.

Here is how it compares:

| | PGP | S/MIME | PostGuard (IBE) |
|---|---|---|---|
| Recipient setup required | Yes -- generate key pair, publish public key | Yes -- obtain certificate from CA | **None** |
| Sender needs to find recipient's key | Yes -- keyserver lookup | Yes -- certificate directory | **No -- email address is the key** |
| Certificate management | Manual (web of trust) | CA-issued certificates | **No certificates** |
| Identity verification | Manual fingerprint checking | Implicit via CA | **Built-in via Yivi identity app** |

## How it works at a high level

1. **The sender** encrypts a message using the recipient's email address and a system-wide public parameter (the Master Public Key) fetched from a trusted server called the PKG.
2. **The recipient** proves they own that email address by completing an identity verification step using the Yivi app (a privacy-preserving identity wallet on their phone).
3. **The PKG** checks the proof and issues a time-limited decryption key that only works for that specific recipient and that specific message.
4. **The recipient** uses the decryption key to read the message.

The critical insight is that encryption (step 1) can happen *without any involvement from the recipient*. They only need to act when they want to decrypt.

::: tip Key takeaway
With PostGuard, you can encrypt a message for someone who has never heard of PostGuard, has never installed any software, and has never generated any keys. They only need to verify their identity when they want to read the message.
:::

## What you can build with it

PostGuard is useful anywhere you need to send sensitive data to a specific person:

- **Encrypted email** -- encrypt email content and attachments so only the intended recipient can read them
- **Secure file sharing** -- encrypt files and share them via a link; only verified recipients can download
- **Access-controlled documents** -- encrypt data with policies that require specific identity attributes (not just email, but also organization membership, age verification, etc.)
- **Backend-to-user encryption** -- a server encrypts data for a user without needing the user to register or create an account first

## Next steps

- Learn the [core concepts](/guide/concepts) behind PostGuard: IBE, the PKG, Yivi, policies, and timestamps
- See the full [system architecture](/guide/architecture) to understand how all the components fit together
