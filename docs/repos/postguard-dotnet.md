# postguard-dotnet

[GitHub](https://github.com/encryption4all/postguard-dotnet) · C# · .NET SDK

PostGuard SDK for .NET applications. Published as `E4A.PostGuard` on NuGet.

**Scope:** Sending-side only. This SDK handles encryption with API key signing. Decryption is handled by the receiving side via [postguard.eu](https://postguard.eu) or the mail plugins.

## Usage

```csharp
using E4A.PostGuard;
using E4A.PostGuard.Models;

var pg = new PostGuard(new PostGuardConfig
{
    PkgUrl = "https://pkg.staging.postguard.eu",
    CryptifyUrl = "https://fileshare.staging.postguard.eu"
});

var sealed = pg.Encrypt(new EncryptInput
{
    Files = [new PgFile("report.txt", fileStream)],
    Recipients = [
        pg.Recipient.Email("citizen@example.com"),
        pg.Recipient.EmailDomain("info@org.nl")
    ],
    Sign = pg.Sign.ApiKey("PG-xxx")
});

// Silent upload — no Cryptify-sent emails. Returns UUID for custom delivery.
var result = await sealed.UploadAsync();
Console.WriteLine(result.Uuid);

// Or opt into Cryptify-sent emails (both flags default false):
var result = await sealed.UploadAsync(new UploadOptions
{
    Notify = new NotifyOptions
    {
        Recipients = true,
        Sender = true,
        Message = "Your documents",
        Language = "EN"
    }
});

// Or get raw sealed bytes (no upload)
byte[] bytes = await sealed.ToBytesAsync();
```

## Architecture

```
PostGuard (C#)
  ├── pg.Encrypt() → Sealed (lazy builder)
  │     ├── .UploadAsync()   → seal + upload to Cryptify
  │     └── .ToBytesAsync()  → seal only
  ├── PkgClient   → GET /v2/parameters, POST /v2/irma/sign/key
  ├── CryptifyClient → chunked upload protocol
  ├── ZipHelper → System.IO.Compression
  └── Native (P/Invoke) → libpg_ffi
        └── pg-core (Rust) → IBE encryption + IBS signing
```

The SDK calls into the Rust `pg-ffi` native library for all cryptographic operations via P/Invoke.

## Development

### Prerequisites

- .NET 8.0+ SDK
- Rust toolchain (for building the native library)

### Build the native library

The `pg-ffi` crate lives in the [postguard](https://github.com/encryption4all/postguard) repo:

```bash
cd ../postguard/pg-ffi
./build.sh
```

This compiles the Rust FFI crate and copies the native library to `src/runtimes/`.

### Build the .NET solution

```bash
dotnet build E4A.PostGuard.slnx
```

### Run the example

See [postguard-examples/pg-dotnet](https://github.com/encryption4all/postguard-examples/tree/main/pg-dotnet).

## Releasing

This repository uses [Release-please](https://github.com/googleapis/release-please) for automated versioning. When changes are merged to `main`, Release-please creates a release PR. Merging that PR triggers:

1. Download of `pg-ffi` native libraries from the [postguard](https://github.com/encryption4all/postguard) releases (linux-x64, linux-arm64, osx-x64, osx-arm64, win-x64)
2. NuGet package publishing via trusted OIDC publishing

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `build.yml` | Push/PR | Downloads pg-ffi, builds, packs (dry run), uploads artifacts |
| `delivery.yml` | Push to main | Release-please PR/release, multi-platform pg-ffi download, NuGet publish |
