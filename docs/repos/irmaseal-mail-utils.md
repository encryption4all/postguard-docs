# irmaseal-mail-utils

[GitHub](https://github.com/encryption4all/irmaseal-mail-utils) · TypeScript · Email Utilities

Browser library for working with PostGuard encrypted emails. Published as `@e4a/irmaseal-mail-utils` on npm.

Used by the [Thunderbird addon](/repos/postguard-tb-addon) and [Outlook add-in](/repos/postguard-outlook-addon) for parsing and composing encrypted email messages.

## What It Does

- **Parse** PostGuard encrypted emails: extract the encrypted payload from a received email so clients can decrypt it.
- **Compose** PostGuard encrypted emails: build a properly formatted email containing encrypted content.
- **Exchange email support**: handle the specific format used by Microsoft Exchange.

## Development

### Prerequisites

- Node.js
- TypeScript

### Building

```bash
# Linux
npm run build-linux

# Windows
npm run build-win
```

### Testing

The tests are runnable examples:

```bash
npm run test
```

### Examples

- Compose and parse an email: `test/composeAndReadMail.ts`
- Parse an Exchange email: `test/readExchangeMail.ts`

### Formatting

```bash
npm run format
```

## Releasing

Versions are published manually to npm.
