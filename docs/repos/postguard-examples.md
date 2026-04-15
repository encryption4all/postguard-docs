# postguard-examples

[GitHub](https://github.com/encryption4all/postguard-examples) · TypeScript, C# · Example Applications

Example applications showing how to integrate PostGuard into different platforms. Use these as starting points for your own integration.

## Examples

### SvelteKit Web App (`pg-sveltekit/`)

A SvelteKit application demonstrating PostGuard file encryption and decryption in a web browser using `@e4a/pg-js`.

```bash
cd pg-sveltekit
npm install
npm run dev
```

### .NET Console App (`pg-dotnet/`)

A .NET console application demonstrating the [postguard-dotnet](/repos/postguard-dotnet) SDK for the "Informatierijk notificeren" use case. It shows two patterns:

1. **Encrypt and Upload** — Encrypts sample files for a citizen (exact email) and an organisation (email domain), uploads to Cryptify, and returns a UUID for custom distribution.
2. **Encrypt and Deliver** — Same as above, but also sends an email notification to the recipient via Cryptify.

**Prerequisites:**

- .NET 8.0+ SDK
- Rust toolchain via [rustup](https://rustup.rs/) (for building the native crypto library)
- A PostGuard API key

**Setup:**

Clone postguard-dotnet alongside this repo:

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
export PG_API_KEY="PG-API-your-key-here"
cd pg-dotnet
dotnet run
```

You can override the default staging URLs:

```bash
export PG_PKG_URL="https://pkg.postguard.eu"
export PG_CRYPTIFY_URL="https://fileshare.postguard.eu"
dotnet run
```

**Usage example:**

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

// Upload only — returns UUID for custom delivery
var result = await sealed.UploadAsync();

// Or upload + send email notification
var result = await sealed.UploadAsync(new UploadOptions
{
    Notify = new NotifyOptions { Message = "Your documents", Language = "EN" }
});
```

## Code Snippets

The examples in this repo are used as the source for code snippets in the [PostGuard documentation](https://docs.postguard.eu). When updating examples, keep in mind that documentation snippets reference specific commit hashes.
