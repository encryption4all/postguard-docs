# .NET Error Handling

The .NET SDK throws typed exceptions that extend `PostGuardException`.

## Error Hierarchy

```
PostGuardException
├── NetworkException        HTTP errors from PKG or Cryptify
└── SealException           Native library encryption errors
```

## `PostGuardException`

Base class for all SDK errors. Catch this to handle any PostGuard failure.

```csharp
try
{
    await sealed.UploadAsync();
}
catch (PostGuardException ex)
{
    Console.WriteLine($"PostGuard error: {ex.Message}");
}
```

## `NetworkException`

Thrown when an HTTP request to the PKG or Cryptify fails.

| Property | Type | Description |
|---|---|---|
| `StatusCode` | `int` | HTTP status code |
| `Body` | `string` | Response body |

```csharp
catch (NetworkException ex)
{
    Console.WriteLine($"HTTP {ex.StatusCode}: {ex.Body}");
}
```

## `SealException`

Thrown when the native cryptographic library (`libpg_ffi`) fails during encryption. This typically indicates a problem with the input data or the native library itself.
