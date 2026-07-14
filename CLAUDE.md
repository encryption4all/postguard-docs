# Project: PostGuard Docs

VitePress documentation site. Run `npm run docs:dev` to preview locally.

## Code Snippets

Code examples in the docs must come from real, working code. Do not invent example code.

Snippets are pasted inline as fenced code blocks with a `<small>` source link underneath pointing to the exact file and lines on GitHub. The link must use a full commit hash so the content is pinned.

Source repositories:

- `encryption4all/postguard-examples` (SvelteKit web app example)
- `encryption4all/postguard-tb-addon` (Thunderbird addon)
- `encryption4all/postguard-outlook-addon` (Outlook addon)

When adding or updating a snippet:

1. Fetch the file from the raw GitHub URL using a specific commit hash: `https://raw.githubusercontent.com/encryption4all/REPO/COMMIT_HASH/path/to/file.ts`
2. Copy the relevant lines into a fenced code block with the correct language tag.
3. Add a source link directly below the code block: `<small>[Source: filename.ts#L20-L31](https://github.com/encryption4all/REPO/blob/COMMIT_HASH/path/to/file.ts#L20-L31)</small>`

Keep snippets focused. Only include the lines that are relevant to the surrounding prose. Do not paste entire files when a 10-30 line extract will do.

## Writing Style Rules

All written content in this project must sound like a competent human wrote it. Follow these rules strictly when writing or editing any prose (markdown, comments, UI copy).

### Banned Words (always replace)

- "delve" / "delve into" -> explore, dig into, look at
- "leverage" -> use
- "utilize" -> use
- "robust" -> strong, reliable, solid
- "comprehensive" -> thorough, complete
- "seamless" -> smooth, easy
- "cutting-edge" -> latest, newest
- "pivotal" -> important, key
- "embark" -> start, begin
- "landscape" -> field, space, area
- "tapestry" -> describe the actual complexity
- "realm" -> area, field, domain
- "paradigm" -> model, approach
- "testament to" -> shows, proves
- "serves as" -> is
- "boasts" -> has
- "in order to" -> to
- "due to the fact that" -> because
- "it's important to note" -> cut entirely or just state the thing
- "it's worth mentioning" -> cut entirely
- "harness" -> use
- "empower" -> let, allow, help
- "foster" -> build, encourage
- "elevate" -> improve, raise
- "streamline" -> simplify
- "holistic" -> complete, full
- "actionable" -> practical, useful
- "impactful" -> effective
- "synergy" -> describe the combined effect directly
- "ecosystem" -> system, community, tooling
- "myriad" -> many
- "plethora" -> many, plenty
- "transformative" -> say what changed
- "cornerstone" -> foundation, base, key part
- "deep dive" -> examine, explore
- "unpack" -> explain, break down
- "game-changer" -> say why it matters
- "genuinely" -> cut or use "really" sparingly

### Banned Transitions

Do not start sentences with: "Moreover," "Furthermore," "Additionally," "Indeed," "Notably," "Consequently," "Subsequently," "Accordingly." Use plain conjunctions (and, but, so, yet) or just start a new sentence.

### Structural Rules

- No "It's not X -- it's Y" contrast framing. Make a direct positive statement instead.
- No significance inflation ("marking a pivotal moment," "watershed moment"). State what happened. Let the reader judge importance.
- No rhetorical question openers ("But what does this mean?" / "Why should you care?"). If you know the answer, state it.
- No generic conclusions ("The future looks bright," "Only time will tell," "One thing is certain"). End with something specific or just stop.
- No mechanical rule of three ("efficient, effective, and reliable"). One or two descriptors is usually enough.
- No synonym cycling. If "developers" is the right word, keep using "developers." Don't rotate through "engineers... practitioners... builders."
- No chatbot artifacts ("Certainly!", "Great question!", "I hope this helps!", "Feel free to reach out", "Let's dive in").
- No "Let's" constructions ("Let's explore," "Let's break this down"). Start with the point.
- No "-ing" chains ("highlighting... emphasizing... facilitating..."). Replace with specific facts.
- No false concession structure ("While X is impressive, Y remains a challenge") unless the concession is specific and earned.
- No vague specificity ("various factors," "a range of considerations"). Name the things or cut.

### Formatting Rules

- Em dashes: target zero. Hard max one per 1,000 words. Use commas, periods, or parentheses instead.
- Bold: target zero. Hard max one per 1,000 words. Do not bold for emphasis in running prose.
- Bullet lists: use only when listing genuinely parallel items (API parameters, config options, steps). Never use lists as a substitute for writing a paragraph. Prose is the default.
- Headers: don't over-nest. H2 and H3 are usually enough.
- Colons in titles: avoid ("PostGuard: The Future of Email Security" -> "PostGuard protects your email" or just "PostGuard").

### Voice

- Use plain, direct English. Prefer common words over elevated ones.
- Use "is" and "are" freely. Do not avoid simple verbs.
- Write with calm authority. Assume the reader is competent.
- State claims directly without excessive hedging ("perhaps," "it could be argued") unless genuine uncertainty exists.
- Have a point of view. Don't balance every argument with a counterargument.
- Vary sentence length. Include some short sentences. Not every sentence needs a subordinate clause.
- Specific over vague. Name tools, functions, files, and versions. "Use the `verify()` method" not "use the appropriate verification mechanism."
- Keep stakes proportional to the subject matter. Documentation is helpful, not revolutionary.

---

## Agent notes (migrated from the dobby memory repo)

## Overview
VitePress site at docs.postguard.eu.

## Build and dev
- Node 22 works fine.
- Never regenerate the lockfile with `npm install --legacy-peer-deps` here. CI's Dockerfile runs plain `npm ci`, which is strict: a `--legacy-peer-deps` install drops the optional `search-insights` peer from `package-lock.json`, so `npm ci` then fails with a missing-from-lockfile error and CI breaks. Plain `npm install` resolves cleanly with 0 vulnerabilities; `--legacy-peer-deps` is not needed. Always verify a dependency change with `rm -rf node_modules && npm ci && npm run docs:build` before pushing, since that's exactly what the Docker build does.
- `npm run docs:build` to verify. `npm run docs:dev` (or `npx vitepress dev docs --port 5173`) to preview; `npx vitepress preview docs --port 4174` to preview a build.
- The VitePress dev server returns a shell HTML page; content renders client-side, so `curl localhost:5173` only shows the SPA bootstrap. To verify content, check `docs/.vitepress/dist/` from `npm run docs:build`.
- Mermaid renders client-side (`vitepress-plugin-mermaid` + `mermaid`, config wrapped with `withMermaid(defineConfig({...}))`); check built HTML for `class="mermaid"` to verify diagrams.

## Dependency override: vitepress pins vite 5
`npm audit` flags moderate advisories chained through `vitepress -> vite -> esbuild`. Don't try to bump `vitepress` to clear them: the latest stable vitepress line pins `vite ^5.4.14`, and the relevant vite patches were never backported to 5.x. The pre-release `vitepress@2.x` line pulls vite 7 but isn't stable yet, and `vitepress-plugin-mermaid` doesn't support vitepress 2.x yet either (re-check both statuses before relying on this section going stale).

The fix is an `overrides` entry in `package.json` forcing patched transitive versions (`esbuild`, `vite`) even though vitepress declares an older peer; vitepress builds fine against the newer vite in practice. Drop the overrides once vitepress 2.x ships stable and vitepress-plugin-mermaid supports it. Until then, re-verify on each audit-flagged dependency bump that the override targets are still the patched floor.

## Source-link conventions (binding)
Code snippets must come from real working code in a source repo, with the link pinned to a full commit hash:
```
<small>[Source: file.ts#L20-L31](https://github.com/.../blob/HASH/path#L20-L31)</small>
```
Never invent examples. When fixing a source-link 404:
1. `curl -sI` the candidate URL, proceed only if it returns HTTP 200.
2. Fetch the file at that hash and confirm the snippet content actually matches the line range. A 200 just means the file exists; the snippet might still be wrong.
3. If no commit matches the snippet, remove the example and replace it with prose pointing at the API page.

## Deployment pipeline (no auto-deploy)
`ci.yml` only builds and pushes a Docker image to `ghcr.io/encryption4all/postguard-docs:edge` on every push to `main`. There is no deploy step. Production (docs.postguard.eu) runs an nginx container serving `docs/.vitepress/dist`; whatever host runs it must pull the new `edge` image and restart the container, or it serves the stale build. To detect a stale deployment, check the `last-modified` header on `index.html` via `curl -I https://docs.postguard.eu/` against a known commit date on `main`.

## postguard-examples drift (known gotcha)
A past "consolidation" commit in postguard-examples flattened `pg-sveltekit/src/routes/download/` and `routes/send/` into a single top-level `+page.svelte`. Docs source-links pinned before that commit which point into those folders will 404. The pre-consolidation API form (`pg.decrypt({uuid, element, recipient})`) also differs from the post-consolidation one (`pg.open({uuid}).decrypt(...)`), so snippets cannot simply be repinned to a later hash without also updating the code shown.

## Canonical PKG / Cryptify hosts
Source of truth: `postguard-js/scripts/smoke.mjs`, `postguard-examples/pg-{node,dotnet,sveltekit}` configs.

| Env | PKG | Cryptify |
|---|---|---|
| Staging | `pkg.staging.postguard.eu` | `storage.staging.postguard.eu` |
| Production | `pkg.postguard.eu` | `storage.postguard.eu` |

Aliases that should NOT be used in docs/snippets:
- `pkg.staging.yivi.app`, `fileshare.staging.yivi.app`: resolve to the same IP but serve the Kubernetes placeholder cert, so real clients fail TLS validation.
- `fileshare.postguard.eu`, `fileshare.staging.postguard.eu`: older Cryptify hostnames replaced by `storage.*`; the `fileshare.*` subdomains no longer serve `/health` on production.

Quick verify: `curl -sI https://pkg.staging.postguard.eu/v2/parameters` returns HTTP 405 (real server, GET-only); `curl -sI https://storage.postguard.eu/health` returns 200.
