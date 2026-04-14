# postguard-tb-addon

[GitHub](https://github.com/encryption4all/postguard-tb-addon) · TypeScript · Thunderbird Extension

End-to-end email encryption extension for Mozilla Thunderbird. Uses identity-based encryption via [Yivi](https://yivi.app) so users can send and receive encrypted emails without managing keys.

## How It Works

The addon integrates into Thunderbird's compose and message display windows. When sending, it encrypts the email body and attachments using `@e4a/pg-js` and wraps the result in a standard email with a PostGuard placeholder body and an encrypted attachment. When viewing a received PostGuard email, it detects the encrypted attachment, prompts the user to authenticate with Yivi, and decrypts the content inline.

For technical details on the encryption and decryption flows, see the [Email Addon Integration](/integrations/email-addon) page.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Thunderbird](https://www.thunderbird.net/) 128+

### Setup

```bash
npm install
cp .env.example .env   # adjust if needed
```

### Build and Run

```bash
npm run build          # production build → dist/
npm run build:dev      # development build (no minification, keeps console.log)
npm run watch          # dev build with file watching
```

To load the extension in Thunderbird: open **Add-ons Manager** > **gear icon** > **Debug Add-ons** > **Load Temporary Add-on**, then select any file inside the `dist/` folder.

## Releasing

The version must be updated in three files before releasing:

1. `package.json` (`"version"`)
2. `manifest.json` (`"version"`)
3. `updates.json` (add a new entry with the new version)

Then commit, push, and tag:

```bash
git add package.json manifest.json updates.json
git commit -m "Bump version to X.Y.Z"
git push origin main
git tag vX.Y.Z && git push origin vX.Y.Z
```

Pushing a `v*` tag triggers the CI pipeline which builds the `.xpi` file and creates a GitHub release.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `build.yml` | Tag push (`v*`) | Validates version consistency, builds, packages `.xpi`, creates GitHub release |
