# postguard-docs

This repo is `docs.postguard.eu`, the documentation site for PostGuard, built
with VitePress. It holds the guides, the SDK reference, integration
instructions, and a page for every repository in the `encryption4all` org under
`docs/repos/`. Every PostGuard README points here.

That is also what makes this repo the place documentation detail belongs.
Material worth keeping that does not belong in the repo it describes lands at
`docs.postguard.eu/repos/<name>`.

## Where this sits

One company, two GitHub orgs. Yivi owns everything: `privacybydesign` is the
Yivi/IRMA lineage, and `encryption4all` is the vehicle the PostGuard research
project used to apply for grants, kept as an org after Yivi bought PostGuard to
commercialise it. The split is historical, not organisational: same company,
same maintainers, same review conventions. We are maintainers on every repo
documented here, not outside contributors.

PostGuard is end-to-end encrypted email and file sending built on
Identity-Based Encryption. A sender encrypts to an identity (an email address)
and the recipient proves that identity to the Private Key Generator to get a
decryption key. Yivi does that authentication, so PostGuard depends on Yivi.

## Repos to consider before changing a page

Nothing here has product behaviour of its own. A page is correct or stale
relative to the repo it documents, so check that repo first:

- `encryption4all/postguard`, the Rust root: `pg-core`, `pg-pkg` (the PKG),
  `pg-wasm`, `pg-cli`, `pg-ffi` and `cryptify/`. Its `COMPATIBILITY.md` governs
  the `/v2` surface the guides describe.
- `encryption4all/postguard-js`, which publishes `@e4a/pg-js` and holds the
  `apps/` clients. The SDK reference tracks `packages/pg-js/etc/pg-js.api.md`.
- `encryption4all/postguard-dotnet` (`E4A.PostGuard`, sending side only),
  `postguard-business`, `postguard-e2e`, and the Rust primitives `ibe`, `ibs`,
  `pg-curve` and `irmars`.
- `privacybydesign/yivi-frontend-packages`, the `@privacybydesign/yivi-*`
  packages the browser flows in these guides load.

Code snippets are copied out of those repos and pinned to a full commit hash;
`npm run check:links` verifies they still resolve. `postguard-website`,
`postguard-tb-addon`, `postguard-outlook-addon`, `postguard-examples` and
`cryptify` are archived and keep their pages, but new snippets come from the
path the code moved to inside `postguard-js` or `postguard`.

## Where the detail is

Not in this file. The build and preview commands, the snippet and source-link
conventions, the writing style rules, the dependency overrides, the build traps
and the deployment pipeline are on this repo's own page,
`docs/repos/postguard-docs.md`. A durable check for an agent working here is a
rule in the agent rule bundle, not a line added back here.

The corpus this file used to be is in git history: 11,680 bytes at `f8ca9c7`,
the last revision carrying it (`git show f8ca9c7:CLAUDE.md`).

This file is orientation. `npm run check:claude-md` holds it to 4,000 bytes.
