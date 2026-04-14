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

A .NET console application demonstrating the [postguard-dotnet](/repos/postguard-dotnet) SDK for server-side encryption and Cryptify upload.

**Prerequisites:**

- .NET 8.0+ SDK
- Rust toolchain (for building the native crypto library)
- A PostGuard API key

**Setup:**

```bash
# Clone postguard-dotnet alongside this repo
# Build the native library (one-time)
cd ../postguard/pg-ffi && ./build.sh

# Set your API key
export PG_API_KEY="PG-API-your-key-here"

# Run
cd pg-dotnet
dotnet run
```

You can override the default staging URLs:

```bash
export PG_PKG_URL="https://pkg.postguard.eu"
export PG_CRYPTIFY_URL="https://fileshare.postguard.eu"
dotnet run
```

## Code Snippets

The examples in this repo are used as the source for code snippets in the [PostGuard documentation](https://docs.postguard.eu). When updating examples, keep in mind that documentation snippets reference specific commit hashes.
