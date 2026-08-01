# Repository Overview

The PostGuard project is split across several repositories in the [encryption4all](https://github.com/encryption4all) GitHub organization. This page gives an overview of each one and how they fit together.

Two of them are workspaces that hold more than one project. [postguard](/repos/postguard) is a Cargo workspace, and since [postguard#277](https://github.com/encryption4all/postguard/pull/277) the Cryptify backend is a member of it. [postguard-js](/repos/postguard-js) is a pnpm workspace holding the SDK, the three end-user apps and the examples. The `postguard-website`, `postguard-tb-addon`, `postguard-outlook-addon` and `postguard-examples` repositories were folded into it and are now archived, so read-only.

## Cryptographic Libraries

These are the low-level building blocks that implement the cryptographic primitives PostGuard relies on.

| Repository | Language | Description |
|---|---|---|
| [pg-curve](/repos/pg-curve) | Rust | Fork of BLS12-381 elliptic curve with target group serialization |
| [ibe](/repos/ibe) | Rust | Identity-Based Encryption schemes on BLS12-381 |
| [ibs](/repos/ibs) | Rust | Identity-Based Signature schemes |
| [irmars](/repos/irmars) | Rust | Client library for talking to Yivi (IRMA) servers |

## Core

The main PostGuard codebase.

| Repository | Language | Description |
|---|---|---|
| [postguard](/repos/postguard) | Rust | Core library, PKG server, WASM bindings, CLI, FFI bindings, and the Cryptify backend |
| [cryptify](/repos/cryptify) | Rust | File encryption and sharing service. The source now lives in `cryptify/` inside the postguard workspace; this repository still builds and publishes the container image |
| [postguard-business](/repos/postguard-business) | SvelteKit | Business portal for organization and API key management |

## Applications

End-user applications, all in the [postguard-js](https://github.com/encryption4all/postguard-js) workspace under `apps/`.

| Application | Path | Language | Description |
|---|---|---|---|
| [postguard-website](/repos/postguard-website) | `apps/website` | SvelteKit | Web frontend for encrypting and sending files |
| [postguard-tb-addon](/repos/postguard-tb-addon) | `apps/tb-addon` | TypeScript | Thunderbird email encryption extension |
| [postguard-outlook-addon](/repos/postguard-outlook-addon) | `apps/outlook-addon` | TypeScript | Outlook email encryption add-in |

## SDKs

Client libraries for integrating PostGuard into applications.

| Repository | Language | Description |
|---|---|---|
| [postguard-js](/repos/postguard-js) | TypeScript | Browser and Node.js SDK (`@e4a/pg-js`), at `packages/pg-js` in the workspace |
| [postguard-dotnet](/repos/postguard-dotnet) | C# | .NET SDK for sending-side encryption (`E4A.PostGuard`) |

## Examples

In the [postguard-js](https://github.com/encryption4all/postguard-js) workspace under `examples/`, built against the in-tree SDK:

| Project | Language | Description |
|---|---|---|
| [pg-sveltekit](/repos/pg-sveltekit) | TypeScript | SvelteKit web app using `@e4a/pg-js` |
| [pg-node](/repos/pg-node) | JavaScript | Node.js CLI using `@e4a/pg-js` from a server runtime |
| [pg-dotnet](/repos/pg-dotnet) | C# | .NET console app using `E4A.PostGuard` |
| [pg-manual](/repos/pg-manual) | JavaScript | Browser example using `@e4a/pg-wasm` directly (no SDK) |

## Dependency Graph

The projects depend on each other roughly as follows. Names in parentheses are workspace members rather than separate repositories.

```
pg-curve
  └── ibe
        └── postguard (pg-core)
              ├── pg-wasm ──────────────── postguard-js (packages/pg-js)
              │                              ├── apps/website
              │                              ├── apps/tb-addon
              │                              └── apps/outlook-addon
              ├── pg-ffi ───────────────── postguard-dotnet
              ├── pg-pkg (PKG server)
              ├── cryptify (file storage)
              └── pg-cli
  └── ibs (used by pg-core for sender signatures)

irmars (Yivi client) ──── postguard (pg-core, pg-pkg, pg-cli)

cryptify (backend) ─────── apps/website (file storage)
```

Because `cryptify` and `pg-core` are now members of one Cargo workspace, they resolve a single `Cargo.lock`. Before the merge each repository resolved its own, so the two services could serialize container headers with different versions of the same serializer.
