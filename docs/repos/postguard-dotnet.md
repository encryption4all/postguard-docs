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
    CryptifyUrl = "https://storage.staging.postguard.eu"
});
// PkgUrl and CryptifyUrl must be absolute https:// URLs.
// The constructor throws ArgumentException otherwise.
// Set AllowInsecureUrls = true to permit http://localhost for local dev.

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

### Client version header

The SDK sends an `X-POSTGUARD-CLIENT-VERSION` header on every PKG and Cryptify request so the servers can attribute traffic by SDK and version. The value has four comma-separated parts: `dotnet,<framework>,pg-dotnet,<version>`, where `<framework>` comes from `RuntimeInformation.FrameworkDescription` and `<version>` from the assembly version.

The header is injected once on the SDK-owned `HttpClient`. A caller-supplied header (any casing) wins. If you bring your own `HttpClient`, the SDK does not mutate it, so you own its headers in that case.

Source: [encryption4all/postguard-dotnet#33](https://github.com/encryption4all/postguard-dotnet/pull/33).

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

- .NET 10.0+ SDK
- Rust toolchain (for building the native library)

### Build the native library

The `pg-ffi` crate lives in the [postguard](https://github.com/encryption4all/postguard) repo:

```bash
cd ../postguard/pg-ffi
./build.sh
```

This compiles the Rust FFI crate and copies the native library to `src/runtimes/`.

CI and the NuGet publish do not build the crate. They download pre-built binaries from the release pinned in `.github/pg-ffi-version`, a one-line file holding the exact `encryption4all/postguard` release tag both workflows pass to `gh release download`. Bump that file to move to a newer release, and check out the same tag when you want a local build of the binaries that ship.

### Build the .NET solution

```bash
dotnet build E4A.PostGuard.slnx
```

### Testing

```bash
dotnet test E4A.PostGuard.slnx
```

The solution multi-targets `net8.0` and `net10.0`, so a plain `dotnet test` needs both runtimes installed. Pass `--framework net10.0` to run against one of them. CI exercises both.

### Public API surface

`src/PublicAPI.Shipped.txt` and `src/PublicAPI.Unshipped.txt` list every public member of `E4A.PostGuard`. Microsoft.CodeAnalysis.PublicApiAnalyzers checks them during `dotnet build`, so changing the public surface without updating the files fails the build. There is no separate CI step. Severity is raised through `<WarningsAsErrors>` in `src/E4A.PostGuard.csproj` rather than `.editorconfig`, because path-based `.editorconfig` severity does not reach the analyzer's additional files.

Add a new member to `PublicAPI.Unshipped.txt`. Record a removal in the same file as `*REMOVED*` followed by the exact line from the shipped file. To get a line in the right format, build and copy the signature out of the `RS0016` message, which prints it as `Namespace.Type.Member(args) -> ret`. IDEs offer the same text as a code fix on the diagnostic.

Both target frameworks produce the same surface today, since `src/` has no `#if`, so one pair of files covers both. A member that becomes framework-conditional would need the files split per framework.

At release time, move the `PublicAPI.Unshipped.txt` entries into `PublicAPI.Shipped.txt`, applying `*REMOVED*` lines as deletions, and leave the unshipped file with only its `#nullable enable` header. Release-please does not do this.

### Run the example

See [postguard-examples/pg-dotnet](https://github.com/encryption4all/postguard-examples/tree/main/pg-dotnet).

## Releasing

This repository uses [Release-please](https://github.com/googleapis/release-please) for automated versioning. When changes are merged to `main`, Release-please creates a release PR. Merging that PR triggers:

1. Download of `pg-ffi` native libraries from the [postguard](https://github.com/encryption4all/postguard) release pinned in `.github/pg-ffi-version` (linux-x64, linux-arm64, osx-x64, osx-arm64, win-x64)
2. NuGet package publishing via trusted OIDC publishing

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `build.yml` | Push/PR | Downloads pg-ffi, builds, packs (dry run), uploads artifacts |
| `delivery.yml` | Push to main | Release-please PR/release, multi-platform pg-ffi download, NuGet publish |
