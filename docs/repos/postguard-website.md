# postguard-website

[GitHub](https://github.com/encryption4all/postguard-website) · SvelteKit · Web Application

The PostGuard web frontend for encrypting and sending files. Users pick files, choose recipients by email address, authenticate with [Yivi](https://yivi.app), and the files are encrypted and uploaded to [Cryptify](/repos/cryptify) for delivery. Built with SvelteKit using the static adapter.

## Integration

The website uses `@e4a/pg-js` with two Vite plugins for WASM support (`vite-plugin-wasm` and `vite-plugin-top-level-await`). It also uses `@e4a/pg-components` for shared UI elements like file pickers and Yivi authentication dialogs.

The website contains two submodules: Cryptify (the file sharing backend, embedded in an iframe) and the Thunderbird addon (the `.xpi` file can be downloaded from the website). To update the submodules:

```bash
git submodule update --init --recursive
```

For a step-by-step example of building a web application with PostGuard, see the [pg-sveltekit](/repos/pg-sveltekit) example, which follows the same patterns as this website.

## Recipient URL forms

The `/decrypt` and `/download` pages each accept a different URL shape depending on which envelope tier `pg-js`'s [`createEnvelope()`](/sdk/js-email-helpers#createenvelope) emitted on the sender side.

| Tier | Encryption mode | URL emitted in body | What the page does |
|------|-----------------|---------------------|--------------------|
| 1 (small) | any | `/decrypt#<urlsafe-base64>` | Decodes the fragment in-browser, builds a `ReadableStream` of the ciphertext, and runs the inner MIME envelope through the fallback decrypter. |
| 2/3 | `data` | `/decrypt?uuid=<id>` | Calls `pg.open({ uuid })` to fetch the ciphertext from [Cryptify](/repos/cryptify), decrypts, then parses the inner MIME with postal-mime. |
| 2/3 | `files` | `/download?uuid=<id>` | Calls `pg.open({ uuid })` to fetch the ciphertext from [Cryptify](/repos/cryptify) and surfaces the contained files for download. |

Both query-string forms accept an optional `?recipient=<key>` hint. When the value matches one of the recipients in the encryption policy, the page skips the recipient picker and authenticates against that key directly.

```ts
// Path 2: ?uuid=… points at a Cryptify-uploaded ciphertext (tier
// 2/3 messages from pg-js >= 1.1.0 in `data: mime` mode). The
// Decrypt component accepts a uuid prop and calls pg.open({ uuid })
// to fetch + decrypt; the parsed plaintext is treated as RFC 5322
// MIME, so attachments and the inner body surface by name (matches
// the receive-side path the Outlook/TB add-ons take).
const params = new URLSearchParams(window.location.search)
const uuidParam = params.get('uuid')
const recipientParam = params.get('recipient')
if (uuidParam) {
    uuid = uuidParam
    recipient = recipientParam ?? undefined
    hashMode = true
    unique = {}
    currRight = RIGHTMODES.Decrypt
}
```

<small>[Source: src/routes/(app)/decrypt/+page.svelte#L86-L106](https://github.com/encryption4all/postguard-website/blob/0398c87d113ab7b9fc518f4eb9aaf7059745d54a/src/routes/%28app%29/decrypt/%2Bpage.svelte#L86-L106)</small>

## Development

### Quick Start with Docker Compose (recommended)

Docker Compose sets up everything: the PostGuard website, Cryptify file share server, IRMA server, PKG server, and a Mailcrab mail testing UI.

```bash
# Initialize submodules (Cryptify, etc.)
git submodule update --init --recursive

# Start all services with hot reload
docker-compose up

# Website:  http://localhost:8080
# Mail UI:  http://localhost:1080
```

Your code changes reload automatically since the source is mounted as a volume.

### Production Environment

```bash
docker-compose -f docker-compose.prod.yml up
# Access at http://localhost
```

### Stopping Services

```bash
# Development
docker-compose down

# Production
docker-compose -f docker-compose.prod.yml down
```

### Building

Building is done automatically through GitHub Actions. You can also build manually:

```bash
docker-compose build      # Build via Docker
npm run build             # Build only the PostGuard website
```

### Manual (without Docker)

```bash
npm install
npm run dev       # dev server
npm run build     # build SPA
npm run preview   # preview production build
```

### Testing

```bash
npm run check     # Svelte type checking
npm run lint      # Prettier + ESLint
npm run format    # auto-format
npm run test      # Playwright tests
```

### Mobile Debugging

To test on a physical Android device, connect the phone with USB debugging enabled and make sure Yivi is in [developer mode](https://docs.yivi.app/yivi-app/#developer-mode):

```bash
adb reverse tcp:8088 tcp:8088   # Yivi / IRMA server (for scanning QR codes)
adb reverse tcp:8080 tcp:8080   # PostGuard website
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_FILEHOST_URL` | `http://localhost:8000` | Cryptify file hosting service URL |
| `VITE_PKG_URL` | `http://localhost:8087` | PKG service URL |
| `VITE_MAX_UPLOAD_SIZE` | none | Maximum file upload size in bytes |
| `VITE_UPLOAD_CHUNK_SIZE` | none | Upload chunk size in bytes |
| `VITE_FILEREAD_CHUNK_SIZE` | none | File read chunk size in bytes |

## Releasing

This repository uses [Release-please](https://github.com/googleapis/release-please) for automated versioning. Merging a release PR triggers a multi-architecture Docker image build pushed to GHCR.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Push/PR | Svelte type checks, release-please, multi-arch Docker build |
| `pr-title.yml` | PR | Validates PR title format |
