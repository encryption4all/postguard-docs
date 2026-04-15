# Getting Started

Pick the SDK that matches your platform, install it, and encrypt something.

## JavaScript / TypeScript

Install the SDK:

::: code-group

```sh [npm]
npm install @e4a/pg-js
```

```sh [pnpm]
pnpm add @e4a/pg-js
```

```sh [yarn]
yarn add @e4a/pg-js
```

:::

The SDK bundles all its dependencies internally. You do not need to install `@e4a/pg-wasm`, Yivi packages, or any other PostGuard package separately.

### Encrypt and upload

```ts
import { PostGuard } from '@e4a/pg-js';

const pg = new PostGuard({
  pkgUrl: 'https://pkg.staging.yivi.app',
  cryptifyUrl: 'https://fileshare.staging.yivi.app',
});

const sealed = pg.encrypt({
  files: fileList,
  recipients: [pg.recipient.email('bob@example.com')],
  sign: pg.sign.apiKey('PG-API-your-key'),
});

const { uuid } = await sealed.upload();
```

### Decrypt

```ts
const opened = pg.open({ uuid });
const result = await opened.decrypt({
  element: '#yivi-web',
});
result.download();
```

The `element` parameter points to an HTML element where the SDK renders the Yivi QR code. The recipient scans this with their Yivi app to prove their identity.

### Bundler configuration

#### Vite / SvelteKit

You need Vite plugins for WASM support and top-level await:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [sveltekit(), wasm(), topLevelAwait()]
});
```

<small>[Source: vite.config.ts](https://github.com/encryption4all/postguard-examples/blob/d6c7f01d3cb63d84e94b1e59079b0d80d748d23b/pg-sveltekit/vite.config.ts)</small>

No Node.js polyfills are needed. The SDK handles all browser compatibility internally.

#### Browser extensions

The SDK inlines its WASM binary as base64 at build time, so no WASM loader plugins or file copying are needed. The Thunderbird addon bundles with esbuild and the WASM is included automatically.

Your extension manifest must allow WASM execution (`'wasm-unsafe-eval'` in Manifest V3 CSP). See the [Thunderbird addon bundling section](/repos/postguard-tb-addon#bundling) for full details.

See the [JS SDK reference](/sdk/js-encryption) for all encryption and decryption options, or the [pg-sveltekit](/repos/pg-sveltekit) example for a complete web app.

## .NET

Install from NuGet:

```sh
dotnet add package E4A.PostGuard
```

The .NET SDK requires a native library (`libpg_ffi`) built from the [postguard](https://github.com/encryption4all/postguard) repo. The NuGet package includes prebuilt binaries for linux-x64, linux-arm64, osx-x64, osx-arm64, and win-x64.

### Encrypt and upload

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
    Recipients = [pg.Recipient.Email("bob@example.com")],
    Sign = pg.Sign.ApiKey("PG-API-your-key")
});

var result = await sealed.UploadAsync();
Console.WriteLine(result.Uuid);
```

The .NET SDK is sending-side only. Decryption is handled by the receiving side via the PostGuard website or email plugins.

See the [.NET SDK reference](/sdk/dotnet-encryption) for all options, or the [pg-dotnet](/repos/pg-dotnet) example for a complete console app.
