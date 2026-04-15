# Repository Overview

The PostGuard project is split across multiple repositories in the [encryption4all](https://github.com/encryption4all) GitHub organization. This page gives an overview of each repository and how they fit together.

## Cryptographic Libraries

These are the low-level building blocks that implement the cryptographic primitives PostGuard relies on.

| Repository | Language | Description |
|---|---|---|
| [pg-curve](/repos/pg-curve) | Rust | Fork of BLS12-381 elliptic curve with target group serialization |
| [ibe](/repos/ibe) | Rust | Identity-Based Encryption schemes on BLS12-381 |
| [ibs](/repos/ibs) | Rust | Identity-Based Signature schemes |

## Core

The main PostGuard codebase and applications.

| Repository | Language | Description |
|---|---|---|
| [postguard](/repos/postguard) | Rust | Core library, PKG server, WASM bindings, CLI, FFI bindings |
| [postguard-website](/repos/postguard-website) | SvelteKit | Web frontend for encrypting and sending files |
| [cryptify](/repos/cryptify) | Rust + TypeScript | File encryption and sharing service (backend + frontend) |
| [postguard-tb-addon](/repos/postguard-tb-addon) | TypeScript | Thunderbird email encryption extension |
| [postguard-outlook-addon](/repos/postguard-outlook-addon) | TypeScript | Outlook email encryption add-in |

## SDKs

Client libraries for integrating PostGuard into applications.

| Repository | Language | Description |
|---|---|---|
| [postguard-js](/repos/postguard-js) | TypeScript | Browser and Node.js SDK (`@e4a/pg-js`) |
| [postguard-dotnet](/repos/postguard-dotnet) | C# | .NET SDK for sending-side encryption (`E4A.PostGuard`) |
| [pg-components](/repos/pg-components) | Svelte | Reusable UI component library (`@e4a/pg-components`) |

## Examples

From the [postguard-examples](https://github.com/encryption4all/postguard-examples) repository:

| Project | Language | Description |
|---|---|---|
| [pg-sveltekit](/repos/pg-sveltekit) | TypeScript | SvelteKit web app using `@e4a/pg-js` |
| [pg-dotnet](/repos/pg-dotnet) | C# | .NET console app using `E4A.PostGuard` |

## Dependency Graph

The repositories depend on each other roughly as follows:

```
pg-curve
  └── ibe
        └── postguard (pg-core)
              ├── pg-wasm ──────────────── postguard-js (@e4a/pg-js)
              │                              ├── postguard-website
              │                              ├── postguard-tb-addon
              │                              └── postguard-outlook-addon
              ├── pg-ffi ───────────────── postguard-dotnet
              ├── pg-pkg (PKG server)
              └── pg-cli
  └── ibs (used by pg-core for sender signatures)

pg-components ──────────── postguard-website
cryptify (backend) ─────── postguard-website (file storage)
```
