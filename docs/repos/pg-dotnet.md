# pg-dotnet

[GitHub](https://github.com/encryption4all/postguard-examples/tree/main/pg-dotnet) · C# · .NET Example

A .NET console application demonstrating the [postguard-dotnet](/repos/postguard-dotnet) SDK for the "Informatierijk notificeren" use case. Part of the [postguard-examples](https://github.com/encryption4all/postguard-examples) repository.

It shows two patterns:

1. **Encrypt and Upload**: Encrypts sample files for a citizen (exact email) and an organisation (email domain), uploads to Cryptify, and returns a UUID for custom distribution.
2. **Encrypt and Deliver**: Same as above, but also sends an email notification to the recipient via Cryptify.

## Prerequisites

- .NET 8.0+ SDK
- Rust toolchain via [rustup](https://rustup.rs/) (for building the native crypto library)
- A PostGuard API key

## Setup

Clone postguard-dotnet alongside the examples repo:

```
Repos/
├── postguard-examples/   (this repo)
│   └── pg-dotnet/
└── postguard-dotnet/     (SDK)
```

Build the native library (one-time):

```bash
cd ../postguard/pg-ffi && ./build.sh
```

Set your API key and run:

```bash
export PG_API_KEY="PG-your-key-here"
cd pg-dotnet
dotnet run
```

You can override the default staging URLs:

```bash
export PG_PKG_URL="https://pkg.postguard.eu"
export PG_CRYPTIFY_URL="https://fileshare.postguard.eu"
dotnet run
```

## Usage

```csharp
var pg = new PostGuard(new PostGuardConfig
{
    PkgUrl = "https://pkg.staging.postguard.eu",
    CryptifyUrl = "https://fileshare.staging.postguard.eu"
});

var sealed = pg.Encrypt(new EncryptInput
{
    Files = [new PgFile("report.txt", stream)],
    Recipients = [
        pg.Recipient.Email("citizen@example.com"),
        pg.Recipient.EmailDomain("info@org.nl")
    ],
    Sign = pg.Sign.ApiKey(apiKey)
});

// Silent upload — no Cryptify-sent emails. Returns UUID for custom delivery.
var result = await sealed.UploadAsync();

// Or upload + opt into Cryptify-sent emails. Recipients = true emails each
// recipient with a download link; Sender = true adds a confirmation back
// to the sender. Both default false.
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
```
