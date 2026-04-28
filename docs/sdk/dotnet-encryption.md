# .NET Encryption

The `E4A.PostGuard` SDK provides sending-side encryption for .NET applications. It handles file encryption, signing via API key, and upload to Cryptify. Decryption is not supported; the receiving side uses the PostGuard website or email plugins.

## Constructor

```csharp
using E4A.PostGuard;
using E4A.PostGuard.Models;

var pg = new PostGuard(new PostGuardConfig
{
    PkgUrl = "https://pkg.staging.postguard.eu",
    CryptifyUrl = "https://fileshare.staging.postguard.eu",
    Headers = new Dictionary<string, string>     // optional
    {
        ["X-My-Client"] = "v1.0"
    }
});
```

| Option | Type | Required | Description |
|---|---|---|---|
| `PkgUrl` | `string` | Yes | URL of the PKG server |
| `CryptifyUrl` | `string` | No | URL of the Cryptify file storage service. Required for `UploadAsync()`. |
| `Headers` | `Dictionary<string, string>` | No | Custom HTTP headers included in all requests |

## Encrypt

`pg.Encrypt()` returns a `Sealed` builder. Nothing happens until you call a terminal method.

```csharp
var sealed = pg.Encrypt(new EncryptInput
{
    Files = [new PgFile("report.txt", fileStream)],
    Recipients = [
        pg.Recipient.Email("citizen@example.com"),
        pg.Recipient.EmailDomain("info@org.nl")
    ],
    Sign = pg.Sign.ApiKey("PG-your-key")
});
```

### Input Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `Files` | `PgFile[]` | Yes | Files to encrypt. Each `PgFile` has a `Name` (string) and `Stream` (Stream). |
| `Recipients` | `RecipientBuilder[]` | Yes | One or more recipients |
| `Sign` | `ISign` | Yes | Signing method (currently only `pg.Sign.ApiKey()`) |

### Terminal Methods

| Method | Returns | Description |
|---|---|---|
| `UploadAsync(ct?)` | `UploadResult` | Encrypt and upload to Cryptify. Returns UUID. |
| `UploadAsync(options, ct?)` | `UploadResult` | Encrypt, upload, and send email notification. |
| `ToBytesAsync(ct?)` | `byte[]` | Encrypt and return the raw sealed bytes. |

All methods accept an optional `CancellationToken`.

## Upload with Notification

```csharp
var result = await sealed.UploadAsync(new UploadOptions
{
    Notify = new NotifyOptions
    {
        Message = "Your documents are ready.",
        Language = "EN",              // "EN" (default) or "NL"
        ConfirmToSender = false       // send copy to sender
    }
});

Console.WriteLine(result.Uuid);
```

## Recipients

```csharp
// Encrypt for an exact email address
pg.Recipient.Email("alice@example.com")

// Encrypt for anyone with an email at a domain
pg.Recipient.EmailDomain("alice@example-org.com")

// Require extra attributes (fluent chaining)
pg.Recipient.Email("alice@example.com")
    .ExtraAttribute("pbdf.gemeente.personalData.surname", "Smith")
    .ExtraAttribute("pbdf.sidn-pbdf.mobilenumber.mobilenumber", "0612345678")
```

## Signing

The .NET SDK supports API key signing only. API keys bypass interactive Yivi sessions and are intended for server-to-server use.

```csharp
pg.Sign.ApiKey("PG-your-key")
```

## Raw Bytes (No Upload)

To get the encrypted bytes without uploading to Cryptify:

```csharp
byte[] encrypted = await sealed.ToBytesAsync();
// Deliver the bytes however you want
```
