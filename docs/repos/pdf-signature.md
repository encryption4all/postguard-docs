# pdf-signature

[GitHub](https://github.com/encryption4all/pdf-signature) · Rust + TypeScript · PDF Signing

PDF signing and signature verification utility. Used within the PostGuard ecosystem for signing PDF documents with identity-based signatures.

## Architecture

The repository is structured similarly to [Cryptify](/repos/cryptify), with a Rust backend and TypeScript frontend:

- **Backend** (`cryptify-back-end/`): Rust service handling PDF operations
- **Frontend** (`cryptify-front-end/`): TypeScript web interface

## Development

### Docker (recommended)

```bash
# Development setup
docker-compose -f docker-compose.dev.yml up

# Production-like setup
docker-compose up
```

### Manual Setup

See the Cryptify development instructions for the general pattern. The backend requires Rust and the frontend requires Node.js.

## Releasing

This repository does not have automated releases.
