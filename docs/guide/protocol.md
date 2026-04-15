# Protocol Specification

This page describes the PostGuard encryption protocol in detail. It covers the cryptographic primitives, the Sign-then-Encrypt composition, identity derivation, wire format, and email integration. For a higher-level overview, see [Core Concepts](/guide/concepts).

## Software Components

The diagram below shows how PostGuard's software components relate to each other. Rust components are shown in orange, JavaScript/TypeScript in blue. The arithmetic layer (elliptic curve implementations) is developed externally.

<p align="center">
  <img src="/components-overview.png" alt="Overview of PostGuard's software components" />
</p>

## Cryptographic Primitives

### DEM/AE

A data encapsulation mechanism (DEM) consists of two algorithms (Enc, Dec) and a key space K, with security parameter λ. PostGuard uses AES-GCM with implementations from RustCrypto for native targets and Web Crypto for browser targets. The Web Crypto backend reduces bundle size and improves performance since browsers have hardware-accelerated AES-NI support on most platforms.

For large messages, PostGuard uses an "online" authenticated encryption scheme (OAE2). OAE2 allows the decrypting party to verify segments one-by-one, which is important for streaming APIs where buffering the full ciphertext before verification is impractical. The scheme is outlined in Hoang et al. [[8]](#references) and implemented in the AEAD module of pg-core. Research into alternative symmetric primitives (e.g. deck functions based on Xoofff [[3]](#references) with the Xoodoo permutation [[5]](#references)) is ongoing.

### IBKEM

An identity-based key encapsulation mechanism (IBKEM) consists of four algorithms: Setup, KeyGen, Encaps, and Decaps. If decapsulation fails, it returns either a random shared secret (implicit rejection) or a ⊥ symbol (explicit rejection). An IBKEM is correct when the same shared secret is derived as long as the identity parameters in Encaps and Decaps match. An IBKEM is anonymous if an attacker cannot determine which identity was used to create a particular ciphertext with non-negligible probability.

PostGuard uses a CCA-secure variant of the CGW15 scheme (scheme the CGW15, [[4]](#references) p. 6, [[9]](#references) p. 41). The scheme is built on the BLS12-381 pairing-friendly curve, which provides λ ≈ 128 bits of security at a reasonable performance level. The actual security level is expected to be a few bits lower. The implementation lives in the [ibe](/repos/ibe) crate, and the curve arithmetic is implemented in [pg-curve](/repos/pg-curve).

### mIBKEM

A multi-recipient IBKEM (mIBKEM) encapsulates the same shared secret for multiple recipients in a single operation. This avoids re-encrypting a large message with multiple symmetric passes.

Constructing an mKEM from a single-recipient KEM is non-trivial because the encapsulation algorithm is probabilistic (the shared secret differs each time). PostGuard solves this by introducing a DEM layer: a shared secret is sampled once, then encrypted under each recipient's receiver key.

**Encapsulation** (multi-recipient):

1. Sample a shared secret *ss* randomly.
2. For each recipient identity *id*:
   - Encapsulate to get a receiver key: *c₀, K_id* ← Encaps(*mpk*, *id*)
   - Encrypt the shared secret under the receiver key: *c₁* ← DEM.Enc(*K_id*, *ss*)
   - Yield the per-recipient ciphertext: *ct_id* = (*c₀*, *c₁*)
3. Return all ciphertexts and the shared secret (*cs*, *ss*).

**Decapsulation** (single recipient):

1. Decapsulate the receiver key: *K_id* ← Decaps(*usk_id*, *c₀*)
2. Decrypt the shared secret: *ss* ← DEM.Dec(*K_id*, *c₁*)
3. Return *ss*.

The result is a ciphertext that is not malleable due to the individual DEM/KEM parts not being malleable. The implementation lives in the `ibe` crate under the `mkem` module. The conversion from IBKEM to mIBKEM is generic, so it can be applied to all IBKEMs in the crate.

### IBS

An identity-based signature scheme (IBS) consists of four algorithms: Setup, KeyGen, Sign, and Ver. PostGuard uses the Galindo-Garcia construction [[7]](#references), which is built on concatenated Schnorr signatures. To generate a user secret key the PKG signs the identity, and to sign a message the user concatenates the PKG's signature with their own signature on the message.

The scheme is built on top of the Ristretto group from the curve25519-dalek crate. Hash functions G and H are instantiated with SHAKE128 and SHA3 respectively. SHAKE128 was chosen for performance: it has a high rate and its second preimage resistance of 128 bits is enough to prevent forgeries, matching PostGuard's security target of λ ≈ 128. For even faster signing, a round-reduced instance like TurboSHAKE [[2]](#references) could be considered.

The implementation lives in the [ibs](/repos/ibs) crate.

## The PostGuard Protocol

PostGuard uses a Sign-then-Encrypt (StE) composition. First, a private signature is set on the message. The message and signature are then encrypted using a hybrid approach (KEM+DEM). The private signature is used to sign the message with potentially sensitive attributes that should only be visible to the recipients specified by the sender in the encryption policy. A public signature is set on the header to provide authenticity on data that the recipient needs to decrypt. The header contains the attributes (with values purged) that a recipient should use to retrieve a decryption key. The header and message are cryptographically bound to each other by including the header in the private signature as a prefix.

### Key Retrieval

Before encrypting or signing, clients retrieve keys from the PKG. The following diagram shows a signing key retrieval flow. Decryption key retrieval works the same way, except the PKG uses IBE.KeyGen(*msk_e*, *id*) instead of IBS.KeyGen(*msk_s*, *id*). Once the JWT is retrieved, subsequent keys can be retrieved using that same JWT.

<p align="center">
  <img src="/key-retrieval.png" alt="Key retrieval sequence diagram" />
</p>

### Sealing and Unsealing

The full encryption and decryption protocol is shown below.

<p align="center">
  <img src="/seal-unseal.png" alt="PostGuard encryption/decryption sequence diagram" />
</p>

**PKG** setup:

- Sets up the encryption master key pair: *mpk_e*, *msk_e* ← KEM.Setup()
- Sets up the signing master key pair: *mpk_s*, *msk_s* ← IBS.Setup()
- Publishes both master public keys *mpk_e* and *mpk_s*
- Extracts keys upon request using IBE.KeyGen(*msk_e*, *id*) and IBS.KeyGen(*msk_s*, *id*), but only after *id* has been verified

**Sender** steps:

1. Requests two signing keys from PKG:
   - *sk_p* is extracted from a public signing identity *id_s^p* (can contain only public attributes, e.g. email address)
   - (optional) *sk_s* is extracted from a private signing identity *id_s^s* (can contain anything, e.g. name, telephone, BSN)
2. Encapsulates a single shared secret for all receivers identified by *ids_r*:
   (*cs*, *K*) ← mIBKEM.Encaps(*mpk_e*, *ids_r*)
3. Constructs and signs a header *h* containing ciphertexts *cs* and associated anonymized receiver identities *ids_r\**. For singleton attributes, the values are fully purged. For some whitelisted non-singleton attributes, the values are partly hidden.
   *h* = Pack(*cs*, *ids_r\**)
   *σ_h* ← IBS.Sign(*sk_p*, *h*)
4. Signs the header and message under the private signing key *sk_s*:
   *σ_m* ← IBS.Sign(*sk_s*, *h* || *m*)
   *ct_sym* ← DEM.Enc_K(*m* || *σ_m* || *id_s^s*)
5. Sends (*h* || *σ_h* || *id_s^p* || *ct_sym*) to the receiver(s).

**Receiver** steps:

1. Verifies the header signature: IBS.Ver(*mpk_s*, *σ_h*, *id_s^p*, *h*)
2. Picks and reconstructs *id_r* from *ids_r\**, and picks its associated ciphertext *ct_{id_r}* from *cs* (both in the header)
3. Requests *usk_{id_r}* from the PKG (which computes KeyGen(*msk_e*, *id_r*))
4. Decapsulates the shared secret: *K* ← mIBKEM.Decaps(*ct_{id_r}*, *usk_{id_r}*)
5. Decrypts and verifies the private signature on the header and message:
   *m* || *σ_m* || *id_s^s* ← DEM.Dec(*K*, *ct_sym*)
   IBS.Ver(*mpk_s*, *σ_m*, *id_s^s*, *h* || *m*)
6. Outputs *m* and optionally *id_s^s* and *id_s^p*.

If the sender does not specify a private signing identity *id_s^s*, the public signing key is reused, i.e. *sk_s* = *sk_p*.

## Mapping Yivi Identities to IBC Identities

PostGuard converts a Yivi policy (also called a *condiscon*) to an IBE/IBS identity using a deterministic hashing algorithm. A policy consists of a conjunction of type-value attribute pairs and a UNIX timestamp.

The conjunction is sorted before hashing to guarantee that semantically equivalent policies always map to the same identity (i.e. the same bytestring). This algorithm can be extended to support other authentication providers by prefixing the different policies with a unique prefix at Line 4.

The hash function H is an incremental hash (init, update, finalize) from the SHA3/Keccak family, as defined in FIPS 202 [[6]](#references). PostGuard uses SHA3-512. Including a timestamp in the policy provides forward secrecy for free, since it prevents decryption keys from being reused indefinitely.

**Algorithm: Derive(*p*)**

```
procedure Derive(p):
  p.con ← sort(p.con)
  h ← H.init()
  h.update(0)
  for i ← 0, |p.con| - 1 do
    (t, v) ← p.con[i]
    h.update(h(2i + 1 || |t| || t))
    h.update(h(2i + 2 || |v| || v))
  h.update(p.timestamp)
  id ← h.finalize()
  return id
```

This algorithm is implemented in pg-core.

## Header Format

PostGuard's header supports binary and human-readable (JSON) serialization. The JSON representation of a header for two recipients (Charlie and Bob) looks like this:

```json
{
  "recipients": {
    "Bob": {
      "policy": {
        "ts": 1566722350,
        "con": [
          { "t": "pbdf.gemeente.personalData.name", "v": "" },
          { "t": "pbdf.sidn-pbdf.email.email", "v": "" }
        ]
      },
      "ct": "r6qIpMgX/WmZTq37qaCoe8r1/ZABelIKR2pEE+H2MRbGbjzgwtEqx+..."
    },
    "Charlie": {
      "policy": {
        "ts": 1566722350,
        "con": [
          { "t": "pbdf.gemeente.personalData.name", "v": "" },
          { "t": "pbdf.sidn-pbdf.email.email", "v": "" }
        ]
      },
      "ct": "sTBs4CBR0qo962XjhxbJ+..."
    }
  },
  "algo": {
    "Aes128Gcm": "yCZDg3BovPyUCV5s"
  },
  "mode": {
    "Streaming": {
      "segment_size": 262144,
      "size_hint": [0, null]
    }
  }
}
```

The attribute values in `con` are empty strings because the header is publicly readable. Purging the values hides recipient identities from each other while still indicating which attribute types are required. The `algo` field contains the symmetric algorithm and IV. The `mode` field indicates whether the message uses in-memory or streaming encryption, along with the segment size (256 KiB = 262144 bytes).

## Wire Format

PostGuard ciphertexts follow a binary wire format. The format has two modes: in-memory (for small data) and streaming (for large data like files).

### In-Memory Mode

In-memory processing is used for small data that can be processed fully in memory. It does not rely on constructions with complex security proofs like the OAE2 STREAM construction [[8]](#references).

<p align="center">
  <img src="/wire-format-inmemory.png" alt="Wire format in-memory mode" />
</p>

The preamble is 10 bytes: a 4-byte prelude (magic number), 2-byte version, and 4-byte header length. The header contains the per-recipient ciphertexts and hidden policies, serialized with bincode (max 1 MiB). Following the header is the header signature *σ_h* and public signing identity *id_s^p*. The ciphertext *ct_sym* contains the symmetrically encrypted message concatenated with the private signature and identity, plus a 16-byte authentication tag *τ*.

### Streaming Mode

Streaming is used for large data like files that need to be processed in segments. Each segment is verified separately. For large messages *m*, the signatures *σ_m* and ciphertext *ct_sym* are processed in user-defined segments asynchronously. The message is split as *m* = *m₀* || ... || *m_n* and processed one segment at a time.

To produce a signature on a segment, the sender computes:

*σ_{m_i}* = IBS.Sign(*sk_s*, *m_i* || *i* || *i* = *n*)

This can be implemented efficiently by cloning the hash state after absorbing a segment. The cloned hash state is used to finish a partial signature, while the original hash state is kept for the remainder of the stream. Schnorr signatures require a fresh nonce per segment, otherwise the secret key is leaked.

The segment counter and a "last segment" byte are appended to prevent outputting valid signatures on prefixes of the full message. The private signing identity *id_s^s* is prepended before the first message segment (*m₀*). The segment and segment signature are then encrypted using the OAE2 AE scheme.

<p align="center">
  <img src="/wire-format-streaming.png" alt="Wire format in streaming mode" />
</p>

## Email Format

PostGuard encrypted emails are formatted in MIME as a `multipart/mixed` message containing:

- A `multipart/alternative` with:
  - A `text/plain` fallback message
  - A `text/html` fallback message
- The PostGuard binary format as an attachment (base64 encoded)

Email clients without PostGuard plugins show the fallback content in HTML if the client allows it. The ciphertext is visible as an attachment with content type `application/postguard`. Plugins scan for this attachment and hide the fallback content. PostGuard does not use the `multipart/encrypted` approach because many email clients assume that implies PGP.

The attachment contains the binary PostGuard format described above. All PostGuard email plugins use the streaming version since messages and attachments can be several megabytes. When decrypted, the plaintext is itself a full email in MIME format. This means that base64-encoded parts like attachments are encoded twice, resulting in a 66% size blowup. This can be avoided by scanning the plaintext on a line-by-line basis to detect parts that are already base64-encoded.

An example PostGuard email in MIME format:

```
MIME-Version: 1.0
To: Test <...>
From: Test <...>
Subject: PostGuard Encrypted Email
Content-Type: multipart/mixed; boundary="--------55m9LR4pU1OH0y2zEFxoDLnH"

This is a multi-part message in MIME format.
----------55m9LR4pU1OH0y2zEFxoDLnH
Content-Type: multipart/alternative;
  boundary="----------qMeHs3P0WgoGhl0jKuCpnRBM"

----------qMeHs3P0WgoGhl0jKuCpnRBM
Content-Type: text/plain; charset=UTF-8; format=flowed
Content-Transfer-Encoding: 7bit

<fallback in plain text>

----------qMeHs3P0WgoGhl0jKuCpnRBM
Content-Type: text/html; charset=UTF-8
Content-Transfer-Encoding: 8bit

<fallback in html>

----------qMeHs3P0WgoGhl0jKuCpnRBM--
----------55m9LR4pU1OH0y2zEFxoDLnH
Content-Type: application/postguard; name="postguard.encrypted"
Content-Disposition: attachment; filename="postguard.encrypted"
Content-Transfer-Encoding: base64

FIq0pwABAAB/oOicnOBtmlybWFzZWFsdGVzdEBnbWFpbC5...
...
----------55m9LR4pU1OH0y2zEFxoDLnH--
```

## References

1. Guido Bertoni, Joan Daemen, Seth Hoffert, Michaël Peeters, Gilles Van Assche, and Ronny Van Keer. Farfalle: parallel permutation-based cryptography. Cryptology ePrint Archive, Paper 2016/1188, 2016. [https://eprint.iacr.org/2016/1188](https://eprint.iacr.org/2016/1188)

2. Guido Bertoni, Joan Daemen, Seth Hoffert, Michaël Peeters, Gilles Van Assche, Ronny Van Keer, and Benoît Viguier. Turboshake. Cryptology ePrint Archive, Paper 2023/342, 2023. [https://eprint.iacr.org/2023/342](https://eprint.iacr.org/2023/342)

3. Norica Băcuieți, Joan Daemen, Seth Hoffert, Gilles Van Assche, and Ronny Van Keer. Jammin' on the deck. Cryptology ePrint Archive, Paper 2022/531, 2022. [https://eprint.iacr.org/2022/531](https://eprint.iacr.org/2022/531)

4. Jie Chen, Romain Gay, and Hoeteck Wee. Improved dual system ABE in prime-order groups via predicate encodings. Cryptology ePrint Archive, Paper 2015/409, 2015. [https://eprint.iacr.org/2015/409](https://eprint.iacr.org/2015/409)

5. Joan Daemen, Seth Hoffert, Michaël Peeters, Gilles Van Assche, and Ronny Van Keer. Xoodoo cookbook. Cryptology ePrint Archive, Paper 2018/767, 2018. [https://eprint.iacr.org/2018/767](https://eprint.iacr.org/2018/767)

6. Morris Dworkin. SHA-3 standard: Permutation-based hash and extendable-output functions. FIPS 202, 2015.

7. David Galindo and Flavio D. Garcia. A Schnorr-like lightweight identity-based signature scheme. In *Progress in Cryptology -- AFRICACRYPT 2009*, pages 135--148. Springer, 2009.

8. Viet Tung Hoang, Reza Reyhanitabar, Phillip Rogaway, and Damian Vizár. Online authenticated-encryption and its nonce-reuse misuse-resistance. Cryptology ePrint Archive, Paper 2015/189, 2015. [https://eprint.iacr.org/2015/189](https://eprint.iacr.org/2015/189)

9. Marloes Venema and Leon Botros. Efficient and generic transformations for chosen-ciphertext secure predicate encryption. Cryptology ePrint Archive, Paper 2022/1436, 2022. [https://eprint.iacr.org/2022/1436](https://eprint.iacr.org/2022/1436)
