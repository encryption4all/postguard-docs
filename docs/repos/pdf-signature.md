# pdf-signature

[GitHub](https://github.com/encryption4all/pdf-signature) · Rust, TypeScript · Signing Service

Signing and signature verification built on PostGuard's identity-based cryptography. A sender discloses an email attribute with Yivi, the PKG hands back a signing key for that identity, and the file is sealed with a signature the recipient can check against the identity rather than against a certificate.

The repository is a fork of [cryptify](/repos/cryptify) and still carries its directory names and much of its upload plumbing. It is its own service though, with its own frontend, branded PostGuard PDF Signature.

The tree has two projects:

| Path | Stack | What it is |
|---|---|---|
| `cryptify-back-end/` | Rust, Rocket 0.5 | The chunked upload service. Stores sealed files, sends notification email, fetches `/v2/sign/parameters` from the PKG. |
| `cryptify-front-end/` | React 19, CRA via craco | The web app, also packaged as an Electron desktop build. Seals and unseals through `@e4a/pg-wasm`. |

There is no PDF-specific code in the tree yet. The name states the intent; the flow that exists today seals and shares any file.

## Configuration

The backend reads a TOML file, `conf/config.toml` for production and `conf/config.dev.toml` for development. Point `ROCKET_CONFIG` at the one you want.

| Parameter | Description |
|---|---|
| `server_url` | Public URL of the service |
| `address` | Bind address |
| `data_dir` | Directory for uploaded files |
| `email_from` | Sender address for notification email |
| `smtp_url` | SMTP server hostname |
| `smtp_port` | SMTP server port |
| `smtp_credentials` | SMTP username and password as a two-element array, commented out by default |
| `allowed_origins` | Regex for CORS allowed origins |
| `pkg_url` | URL of the PostGuard PKG server |

`smtp_credentials` is where this repository differs from Cryptify, which takes `smtp_username` and `smtp_password` as separate keys. A config copied across from Cryptify will not load.

<small>[Source: conf/config.toml](https://github.com/encryption4all/pdf-signature/blob/795cebe419f04df841930aab287966792e283f0f/conf/config.toml)</small>

## Development

Docker is the quickest way in:

```bash
docker-compose -f docker-compose.dev.yml up   # development
docker-compose up                             # production-like
```

Without Docker, the backend needs a Rust toolchain and the frontend needs Node.

```bash
cd cryptify-back-end && cargo build
cd cryptify-front-end && npm install --legacy-peer-deps && npm start
```

The frontend install needs `--legacy-peer-deps`. react-scripts 5.0.1 declares an optional peer of `typescript@^3.2.1 || ^4` and the repository is on TypeScript 5, so a plain `npm install` stops on that conflict. `npm install` also rewrites `package-lock.json` and `yarn.lock` together; commit both.

With no backend running, the dev server logs failed fetches against `/v2/sign/parameters` and `/v2/upload/init`. That is expected. The bundle loading is the signal that the frontend build is healthy.

## Testing

There is no CI workflow in this repository, so nothing runs on a push or a pull request. Both suites have to be run locally, and a pull request body should say so.

```bash
cd cryptify-back-end && cargo test && cargo fmt --check
cd cryptify-front-end && npm run test:electron
```

`npm run test:electron` is the real frontend suite: `node --test test/*.test.js`. Use it rather than `npm test`, which maps to `craco test` and reports no specs, because the test files live in `test/` instead of `src/` and use `node --test` rather than jest.

## Electron packaging

The desktop build runs a hardened `BrowserWindow`: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, with `public/preload.js` as the bridge. Nothing in `src/` touches Node at runtime; every `process.env` reference there is a build-time constant substituted by webpack.

`build.files` in `package.json` must list the directory that holds `main`, currently `public/`. Naming only the entry file makes electron-builder force-include that one file and silently drop the siblings it requires, `windowConfig.js` and `preload.js` among them, and the packaged app then dies with `MODULE_NOT_FOUND`. `test/windowConfig.test.js` asserts the directory is covered. The `./build/*` entry in the same list is top-level only rather than recursive, so `build/static/` is not covered by it.

Packaging cannot be verified on a headless aarch64 machine. Only a real `electron-builder` run confirms a packaging fix.

## Dependency notes

`pg-core` in the backend and `@e4a/pg-wasm` in the frontend have to move together. The backend `Unsealer` parses what the frontend sealed, so a major bump on one side alone breaks decryption.

A few upgrades in this tree need code changes rather than a version bump:

- rand 0.10 renamed the entry points: `thread_rng().gen()` becomes `rng().random()`, and the extension trait is `RngExt`.
- sha2 and digest 0.11 dropped `LowerHex` on the output array, so `format!("{:x}", h.finalize())` no longer compiles. `main.rs` has a `bytes_to_hex` helper for this.
- webpack must stay at 5.96 or later to parse the wasm that `@e4a/pg-wasm` 0.6 ships. Older webpack fails with `Module parse failed: parseVec could not cast the value`, because the module uses wasm-bindgen reference types. The `overrides` block in `package.json` pins it.
- TypeScript is capped at 5.x. react-scripts 5 pulls fork-ts-checker-webpack-plugin 6.5.3, which crashes on TypeScript 6.
- webpack-dev-server cannot go to 5.x while react-scripts 5 is in place. react-scripts passes the removed `https` option, which the version 5 schema rejects, and `npm start` exits. This is development only; fixing it properly means migrating from CRA to Vite.
- yivi-frontend-packages 1.0 switched to named exports (`import { YiviCore } from ...`) and ships real types. Session option callbacks need typed-compatible signatures, and `SessionMappings.sessionToken` is optional, so do not destructure it blindly. `yivi-web` is imported directly by the frontend, not just pulled in transitively; keep it declared as a direct dependency.

`npm audit` reports a low-severity advisory on `elliptic` with no patched release. It arrives through node-polyfill-webpack-plugin, node-stdlib-browser and crypto-browserify, and the app never imports Node's `crypto`, so it is never bundled. An override for it is not worth chasing.

## Releasing

No release automation. No `pr-title.yml`.
