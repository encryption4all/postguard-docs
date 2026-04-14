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

The main PostGuard codebase, containing the encryption protocol, PKG server, WASM bindings, and CLI.

| Repository | Language | Description |
|---|---|---|
| [postguard](/repos/postguard) | Rust | Core library, PKG server, WASM bindings, CLI, FFI bindings |

## SDKs

Client libraries for integrating PostGuard into applications.

| Repository | Language | Description |
|---|---|---|
| [postguard-js](/repos/postguard-js) | TypeScript | Browser and Node.js SDK (`@e4a/pg-js`) |
| [postguard-dotnet](/repos/postguard-dotnet) | C# | .NET SDK for sending-side encryption (`E4A.PostGuard`) |
| [irmaseal-mail-utils](/repos/irmaseal-mail-utils) | TypeScript | Email parsing and composition utilities (`@e4a/irmaseal-mail-utils`) |
| [pg-components](/repos/pg-components) | Svelte | Reusable UI component library (`@e4a/pg-components`) |

## Applications

End-user applications and services built on PostGuard.

| Repository | Language | Description |
|---|---|---|
| [postguard-website](/repos/postguard-website) | SvelteKit | Web frontend for encrypting and sending files |
| [postguard-tb-addon](/repos/postguard-tb-addon) | TypeScript | Thunderbird email encryption extension |
| [postguard-outlook-addon](/repos/postguard-outlook-addon) | TypeScript | Outlook email encryption add-in |
| [cryptify](/repos/cryptify) | Rust + TypeScript | File encryption and sharing service (backend + frontend) |
| [postguard-fallback](/repos/postguard-fallback) | Rust | Web-based decryption fallback service |

## Examples and Documentation

| Repository | Language | Description |
|---|---|---|
| [postguard-examples](/repos/postguard-examples) | TypeScript, C# | Example applications (SvelteKit, .NET) |
| [pg-example](/repos/pg-example) | TypeScript | Standalone example app for file/string encryption |
| [pdf-signature](/repos/pdf-signature) | Rust + TypeScript | PDF signing and verification |
| [postguard-docs](/repos/postguard-docs) | VitePress | This documentation site |

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

irmaseal-mail-utils ────── postguard-tb-addon, postguard-outlook-addon
pg-components ──────────── postguard-website
cryptify (backend) ─────── postguard-website (file storage)
```
