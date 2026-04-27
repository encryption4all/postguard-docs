# postguard-business

[GitHub](https://github.com/encryption4all/postguard-business) · SvelteKit · Business Portal

Business portal for organizations using PostGuard for Business. Organizations register, manage API keys, view the email audit log, and verify domains. Admins manage organizations, review audit logs, and can impersonate an organization to see what it sees. Authentication is done with Yivi attributes for both organization users and admins.

The portal runs at `business.postguard.eu` in production and `business.staging.postguard.eu` in staging.

## Integration

The portal is a standalone SvelteKit application with its own PostgreSQL database. It talks to the [PKG server](/repos/postguard) to issue API keys and verify signatures, and it uses [Yivi](https://yivi.app) for attribute-based login. It does not depend on `@e4a/pg-js` directly because encryption happens client-side in the apps that consume the API keys (see [postguard-website](/repos/postguard-website) and the [pg-sveltekit example](/repos/pg-sveltekit)).

## Tech stack

| Component | Choice |
|---|---|
| Framework | SvelteKit with `adapter-node` (server-side rendering) |
| UI | Svelte 5 with runes (`$state`, `$derived`, `$props`) |
| ORM | Drizzle with the `postgres.js` driver |
| Database | PostgreSQL 18 |
| Styling | SCSS with CSS custom properties |
| i18n | `svelte-i18n` (en-US, nl-NL) |
| Auth | Yivi via the official Yivi frontend SDK |

<small>[Source: README.md](https://github.com/encryption4all/postguard-business/blob/f4676e0c1752f0acad9d99021e19056b4285a6dc/README.md)</small>

## Development

### Prerequisites

- Docker and Docker Compose
- Node.js 24+ (for running checks locally)

### Running locally

```bash
git clone git@github.com:encryption4all/postguard-business.git
cd postguard-business
npm install
cp .env.example .env
docker compose up
```

The stack starts these services:

| Service | URL | Purpose |
|---|---|---|
| App | `http://localhost:8080` | SvelteKit dev server via nginx |
| Adminer | `http://localhost:8081` | Database admin UI |
| MailCrab | `http://localhost:1080` | Email capture UI |
| IRMA server | `http://localhost:8088` | Yivi dev server |

A `db-setup` service runs migrations and seeds a demo admin account plus an example organization on first start.

<small>[Source: README.md](https://github.com/encryption4all/postguard-business/blob/f4676e0c1752f0acad9d99021e19056b4285a6dc/README.md)</small>

### Demo accounts

The seed script creates accounts that work with `irma-demo` attributes:

| Role | Attribute | Value |
|---|---|---|
| Admin | Email | `admin@postguard.eu` |
| Admin | Full name | `Jan de Admin` |
| Admin | Phone | `0612345678` |
| Org user | Email | `info@acme.example.nl` |

Admin login is at `/auth/login/admin`. Org login is at `/auth/login`. Override the admin credentials by setting `ADMIN_EMAIL`, `ADMIN_FULL_NAME`, and `ADMIN_PHONE` in `.env`.

### Site URL

`PUBLIC_SITE_URL` is the public origin of the deployment. It is used to build canonical tags, the Open Graph image URL, JSON-LD structured data, and the sitemap. Local default is `http://localhost:5173`; staging and production set it to the deployed origin via `postguard-ops`.

<small>[Source: .env.example](https://github.com/encryption4all/postguard-business/blob/e5b41a58f603cdae0d066f9e4b8c1c779ae6637e/.env.example)</small>

## Feature flags

Every feature is toggleable via an environment variable. In development mode, flags can also be toggled at runtime from the admin settings page.

| Flag | Controls |
|---|---|
| `FF_PRICING_PAGE` | Pricing page visibility |
| `FF_REGISTRATION` | Organization registration form |
| `FF_PORTAL_API_KEYS` | API key management in the portal |
| `FF_PORTAL_ORG_INFO` | Organization info page |
| `FF_PORTAL_EMAIL_LOG` | Email audit log |
| `FF_PORTAL_DNS` | DNS verification page |
| `FF_ADMIN_PANEL` | Entire admin panel |
| `FF_ADMIN_ORG_STATUS` | Activate and suspend org buttons |
| `FF_ADMIN_AUDIT_LOG` | Admin audit log page |
| `FF_ADMIN_IMPERSONATION` | Admin impersonation feature |

<small>[Source: README.md](https://github.com/encryption4all/postguard-business/blob/f4676e0c1752f0acad9d99021e19056b4285a6dc/README.md)</small>

## Database

Schema is defined in `src/lib/server/db/schema.ts` using Drizzle's `pgTable`. The main tables are `organizations` (registered organizations), `business_api_keys` (API keys, prefixed with `business_` to avoid collision with the PKG's own `api_keys` table), and `sessions` (server-side sessions with hashed tokens).

## Releasing

This repository uses [Release Please](https://github.com/googleapis/release-please) for automated versioning. The first release tag is `v1.0.0`.

## Related pages

- [PostGuard for Business usage flows](/guide/usage-flows#postguard-for-business) explains how an organization uses its API key to sign encrypted emails.
- [API key signing](/guide/concepts#api-key-signing-postguard-for-business) covers the sender side of the flow in the SDK.
- [pg-sveltekit example](/repos/pg-sveltekit) shows a consumer application that uses a business API key to encrypt files.
