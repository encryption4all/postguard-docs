# pg-manual

[GitHub](https://github.com/encryption4all/postguard-examples/tree/main/pg-manual) · JavaScript · WASM Example

A webpack-bundled browser example that uses the low-level `@e4a/pg-wasm` module directly, without the `@e4a/pg-js` SDK. Part of the [postguard-examples](https://github.com/encryption4all/postguard-examples) repository.

Use this example when you want to see what `@e4a/pg-js` wraps. It calls the WASM bindings, the PKG HTTP API, and a Yivi popup directly. For application code, prefer the SDK shown in [pg-sveltekit](/repos/pg-sveltekit); the manual flow is here for reference and for projects that cannot use the SDK.

It shows two patterns:

1. **String encryption** — encrypt and decrypt an in-memory string with `seal` / `Unsealer`.
2. **File streaming** — encrypt and decrypt a file via `sealStream` / `StreamUnsealer`, using the browser's `ReadableStream` and StreamSaver for the output.

## Running

```bash
cd pg-manual
npm install
npm run dev
```

The dev server runs on `localhost:9000`. Open `string.html` or `file.html` from the index page.

## Setup

The example uses webpack with the `asyncWebAssembly` and `topLevelAwait` experiments enabled, plus Node.js polyfills for `https`, `http`, `url`, and `util`:

```js
module.exports = {
    experiments: {
        asyncWebAssembly: true,
        topLevelAwait: true,
    },
    resolve: {
        fallback: {
            https: require.resolve('https-browserify'),
            http: require.resolve('stream-http'),
            url: require.resolve('url/'),
            util: require.resolve('util/'),
            events: false,
        },
    },
    plugins: [
        new webpack.ProvidePlugin({ process: 'process/browser' }),
    ],
}
```

<small>[Source: webpack.config.js](https://github.com/encryption4all/postguard-examples/blob/1fc59758892833455dd54cd2c1c7e6a4fcf8ff6e/pg-manual/webpack.config.js)</small>

The PKG URL and a small Yivi-session helper live in `utils.js`. The helper performs an IRMA session and returns either an encryption key (USK) or a signing key pair, depending on the `sort` argument:

```js
export const KeySorts = {
    Encryption: 'key',
    Signing: 'sign/key',
}

export const PKG_URL = 'https://main.postguard.ihub.ru.nl/pkg'
```

<small>[Source: utils.js#L1-L12](https://github.com/encryption4all/postguard-examples/blob/1fc59758892833455dd54cd2c1c7e6a4fcf8ff6e/pg-manual/examples/utils.js#L1-L12)</small>

## Encrypt a string

Fetch the master public key, build a recipient policy and a signing identity, fetch a signing key via Yivi, then call `seal`:

```js
const { seal } = await import('@e4a/pg-wasm')

const mpk = await fetch(`${PKG_URL}/v2/parameters`)
    .then((r) => r.json())
    .then((j) => j.publicKey)

const policy = {
    Bob: {
        ts: Math.round(Date.now() / 1000),
        con: [{ t: 'irma-demo.sidn-pbdf.email.email', v: 'bob@example.com' }],
    },
}

const pubSignId  = [{ t: 'irma-demo.gemeente.personalData.fullname', v: 'Alice' }]
const privSignId = [{ t: 'irma-demo.gemeente.personalData.bsn', v: '1234' }]

const { pubSignKey, privSignKey } = await fetchKey(
    KeySorts.Signing,
    { con: [...pubSignId, ...privSignId] },
    undefined,
    { pubSignId, privSignId }
)

const encoded = new TextEncoder().encode(input)
const ct = await seal(mpk, { policy, pubSignKey, privSignKey }, encoded)
```

<small>[Source: string.js](https://github.com/encryption4all/postguard-examples/blob/1fc59758892833455dd54cd2c1c7e6a4fcf8ff6e/pg-manual/examples/string.js)</small>

## Decrypt a string

Fetch the verification key, build an `Unsealer`, request a USK matching one of the recipients in the header, then `unseal`:

```js
const { Unsealer } = await import('@e4a/pg-wasm')

const vk = await fetch(`${PKG_URL}/v2/sign/parameters`)
    .then((r) => r.json())
    .then((j) => j.publicKey)

const unsealer = await Unsealer.new(ct, vk)
const header = unsealer.inspect_header()

const keyRequest = {
    con: [{ t: 'irma-demo.sidn-pbdf.email.email', v: 'bob@example.com' }],
}
const timestamp = header.get('Bob').ts
const usk = await fetchKey(KeySorts.Encryption, keyRequest, timestamp)

const [plain, policy] = await unsealer.unseal('Bob', usk)
const original = new TextDecoder().decode(plain)
```

<small>[Source: string.js](https://github.com/encryption4all/postguard-examples/blob/1fc59758892833455dd54cd2c1c7e6a4fcf8ff6e/pg-manual/examples/string.js)</small>

## Encrypt and decrypt files

For files, use `sealStream` and `StreamUnsealer` with the browser's native streams. The output is written via [StreamSaver](https://github.com/jimmywarting/StreamSaver.js):

```js
import { createWriteStream } from 'streamsaver'

const fileWritable = createWriteStream(outFileName)
const readable = inFile.stream()

if (decrypt) {
    const { StreamUnsealer } = await import('@e4a/pg-wasm')
    const unsealer = await StreamUnsealer.new(readable, vk)
    // …fetch USK as in the string example…
    await unsealer.unseal('Bob', usk, fileWritable)
} else {
    const { sealStream } = await import('@e4a/pg-wasm')
    await sealStream(mpk, sealOptions, readable, fileWritable)
}
```

<small>[Source: file.js](https://github.com/encryption4all/postguard-examples/blob/1fc59758892833455dd54cd2c1c7e6a4fcf8ff6e/pg-manual/examples/file.js)</small>

A `WritableStream` polyfill is installed for older browsers:

```js
import { PolyfilledWritableStream } from 'web-streams-polyfill'

if (window.WritableStream == undefined) {
    window.WritableStream = PolyfilledWritableStream
}
```

<small>[Source: file.js#L1-L8](https://github.com/encryption4all/postguard-examples/blob/1fc59758892833455dd54cd2c1c7e6a4fcf8ff6e/pg-manual/examples/file.js#L1-L8)</small>

## Demo credentials

The example uses the public IRMA demo issuers — anyone can issue test attributes from <https://privacybydesign.foundation/attribute-index/en/irma-demo.gemeente.personalData.html>. Replace these with production attributes in real applications.
