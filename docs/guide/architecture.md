# System Architecture

This page describes PostGuard's components, how they communicate, and the key hierarchy that makes Identity-Based Encryption work.

## Components

PostGuard consists of four main parts:

| Component | Role | Required? |
|---|---|---|
| **PKG server** | Trusted server that holds the master key pair. Publishes the Master Public Key, verifies identities via Yivi, and issues decryption keys. | Yes |
| **Yivi app** | Mobile identity wallet. Users prove they own an email address (or other attributes) by scanning a QR code. | Yes (for decryption and peer-to-peer signing) |
| **Client SDK** (`@e4a/pg-js`) | JavaScript/TypeScript library that handles encryption, decryption, policy building, and communication with the PKG and Cryptify. | Yes |
| **Cryptify** | File hosting service for encrypted files. Handles upload, download, and optional email notifications. | No -- you can deliver ciphertext yourself |

## Key Hierarchy

PostGuard's cryptography is built on a two-level key hierarchy:

```
Master Key Pair (lives on the PKG server)
  |
  +-- Master Public Key (MPK)
  |     Published at /v2/parameters
  |     Fetched by senders before encryption
  |     Combined with recipient identity + timestamp to encrypt
  |
  +-- Master Secret Key (MSK)
        Never leaves the PKG
        Used to derive User Secret Keys
              |
              +-- User Secret Key (USK)
                    Derived from MSK + recipient identity + timestamp
                    Issued to recipient after identity verification
                    Time-limited (expires at 4 AM next day)
                    Used to decrypt ciphertext
```

The essential property: anyone with the MPK can encrypt for any identity, but only the PKG can derive the USK needed to decrypt. The PKG only does so after verifying the recipient's identity through Yivi.

## Encryption Flow

Here is what happens when a sender encrypts data:

```
Sender Application                    PKG Server
       |                                   |
       |  1. GET /v2/parameters            |
       |---------------------------------->|
       |  <- Master Public Key (MPK)       |
       |<----------------------------------|
       |                                   |
       |  2. POST /v2/irma/sign/key        |
       |  (with API key or Yivi JWT)       |
       |---------------------------------->|
       |  <- Signing keys                  |
       |<----------------------------------|
       |                                   |
       |  3. Build encryption policy       |
       |  (recipient email + timestamp)    |
       |                                   |
       |  4. Seal data                     |
       |  MPK + policy + signing keys      |
       |  --> encrypted ciphertext         |
       |                                   |
       |                          Cryptify (optional)
       |  5. Upload ciphertext             |
       |---------------------------------->|
       |  <- UUID                          |
       |<----------------------------------|
```

**Step by step:**

1. The SDK fetches the **Master Public Key** from the PKG.
2. The sender authenticates (via API key or Yivi) to obtain **signing keys** that embed their identity in the ciphertext.
3. The SDK builds an **encryption policy** -- a mapping from each recipient's email to the attributes they must prove, plus a timestamp.
4. The SDK **seals** the data using WebAssembly cryptography. The output is a binary blob that can only be decrypted by someone who satisfies the policy.
5. Optionally, the ciphertext is **uploaded to Cryptify**, which returns a UUID link for the recipient.

## Decryption Flow

Here is what happens when a recipient decrypts:

```
Recipient App         PKG Server         Yivi App (phone)
      |                    |                     |
      |  1. Download       |                     |
      |  ciphertext        |                     |
      |  (from Cryptify    |                     |
      |   or other source) |                     |
      |                    |                     |
      |  2. Parse policy   |                     |
      |  from ciphertext   |                     |
      |  (extract required |                     |
      |   attributes +     |                     |
      |   timestamp)       |                     |
      |                    |                     |
      |  3. POST /v2/request/start               |
      |  (attribute request)                     |
      |------------------->|                     |
      |  <- session QR     |                     |
      |<-------------------|                     |
      |                    |                     |
      |  4. Display QR code                      |
      |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~> |
      |                    |  5. User scans QR   |
      |                    |  and approves        |
      |                    |<--------------------|
      |                    |  (cryptographic      |
      |                    |   proof of identity) |
      |                    |                     |
      |  6. GET /v2/request/jwt/{token}          |
      |------------------->|                     |
      |  <- JWT (proof)    |                     |
      |<-------------------|                     |
      |                    |                     |
      |  7. GET /v2/irma/key/{timestamp}         |
      |  (with JWT)        |                     |
      |------------------->|                     |
      |  <- User Secret    |                     |
      |     Key (USK)      |                     |
      |<-------------------|                     |
      |                    |                     |
      |  8. Unseal data    |                     |
      |  USK + ciphertext  |                     |
      |  --> plaintext     |                     |
```

**Step by step:**

1. The recipient obtains the ciphertext (downloaded from Cryptify, received as an email attachment, etc.).
2. The SDK **parses the ciphertext header** to extract the policy: which attributes are required and what timestamp was used.
3. The SDK **starts a Yivi session** via the PKG, requesting the attributes specified in the policy.
4. The application **displays a QR code** (or triggers a deep link on mobile).
5. The recipient **scans the QR code** with their Yivi app and approves the attribute disclosure.
6. The SDK **retrieves a JWT** from the PKG that proves the Yivi session completed successfully.
7. The SDK **requests the User Secret Key (USK)** from the PKG, passing the JWT and the timestamp from the ciphertext. The PKG verifies the proof and derives the USK.
8. The SDK **unseals the ciphertext** using the USK, producing the original plaintext.

::: tip Streaming support
Both encryption and decryption use streaming (ReadableStream/WritableStream), so large files are processed without loading everything into memory at once.
:::

## API Endpoints Overview

The PKG server exposes the following endpoints:

### Public Parameters

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v2/parameters` | Fetch the Master Public Key (MPK) |
| `GET` | `/v2/sign/parameters` | Fetch the public verification key for signature checking |

### Yivi Sessions

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v2/request/start` | Start a Yivi identity verification session |
| `GET` | `/v2/request/jwt/{token}` | Retrieve the JWT result of a completed Yivi session |

### Key Issuance

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v2/irma/key/{timestamp}` | Retrieve a User Secret Key (USK). Requires a valid JWT in the `Authorization` header. The `timestamp` must match the one embedded in the ciphertext. |
| `POST` | `/v2/irma/sign/key` | Retrieve signing keys. Authenticate with either an API key (`Bearer` token) or a Yivi JWT. |

### Cryptify (File Hosting)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/fileupload/init` | Initialize a file upload. Returns a UUID and upload token. |
| `PUT` | `/fileupload/{uuid}` | Upload a chunk. Uses `Content-Range` headers for offset tracking. |
| `POST` | `/fileupload/finalize/{uuid}` | Finalize the upload after all chunks are sent. |
| `GET` | `/filedownload/{uuid}` | Download an encrypted file as a stream. |

::: warning Authentication
The PKG key endpoints require a valid `Authorization: Bearer <jwt>` header. The JWT is obtained through a completed Yivi session (for end-users) or provided directly via API key (for server-to-server / PostGuard for Business).
:::

## Putting It All Together

Here is the full picture of how the components interact:

```
+-------------------+          +-------------------+
|   Sender App      |          |   Recipient App   |
|  (uses @e4a/pg-js)|          |  (uses @e4a/pg-js)|
+--------+----------+          +--------+----------+
         |                              |
    encrypt                        decrypt
         |                              |
         v                              v
+-------------------+          +-------------------+
|    PKG Server     |<-------->|     Yivi App      |
|                   |  verify  |   (on phone)      |
| - Holds MPK / MSK |  identity|                   |
| - Issues USKs     |          | - Holds verified  |
| - Issues sign keys|          |   attributes      |
+-------------------+          +-------------------+
         ^
         |
         v
+-------------------+
| Cryptify (optional)|
|                    |
| - Stores encrypted |
|   files            |
| - Sends email      |
|   notifications    |
+--------------------+
```

The sender and recipient applications both use the `@e4a/pg-js` SDK. The sender only talks to the PKG (and optionally Cryptify). The recipient talks to the PKG, which in turn coordinates with the Yivi app on the recipient's phone to verify their identity before issuing a decryption key.
