# postguard-website

[GitHub](https://github.com/encryption4all/postguard-website) · SvelteKit · Web Application

The PostGuard web frontend for encrypting and sending files. Users pick files, choose recipients by email address, authenticate with [Yivi](https://yivi.app), and the files are encrypted and uploaded to [Cryptify](/repos/cryptify) for delivery. Built with SvelteKit using the static adapter.

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
| `VITE_MAX_UPLOAD_SIZE` | — | Maximum file upload size in bytes |
| `VITE_UPLOAD_CHUNK_SIZE` | — | Upload chunk size in bytes |
| `VITE_FILEREAD_CHUNK_SIZE` | — | File read chunk size in bytes |

## Releasing

This repository uses [Release-please](https://github.com/googleapis/release-please) for automated versioning. Merging a release PR triggers a multi-architecture Docker image build pushed to GHCR.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Push/PR | Svelte type checks, release-please, multi-arch Docker build |
| `pr-title.yml` | PR | Validates PR title format |
