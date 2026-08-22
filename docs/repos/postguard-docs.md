# postguard-docs

[GitHub](https://github.com/encryption4all/postguard-docs) · VitePress · Documentation Site

The site you are reading. It holds the guides, the SDK reference, integration instructions, and a page for every repository in the [encryption4all](https://github.com/encryption4all) organization. Every PostGuard README points here, so documentation detail that does not belong in the repo it describes belongs on that repo's page under `/repos/`.

Production runs at [docs.postguard.eu](https://docs.postguard.eu) as an NGINX container serving the built `docs/.vitepress/dist`.

## Development

### Prerequisites

- Node.js 22

### Running locally

```bash
npm install
npm run docs:dev     # or: npx vitepress dev docs --port 5173
```

```bash
npm run docs:build
npm run docs:preview # or: npx vitepress preview docs --port 4174
```

The dev server returns a shell HTML page and renders content client-side, so `curl localhost:5173` only shows the SPA bootstrap. To check rendered content, read `docs/.vitepress/dist/` after `npm run docs:build`.

Mermaid diagrams also render client-side, through `vitepress-plugin-mermaid` with the config wrapped as `withMermaid(defineConfig({...}))`. Look for `class="mermaid"` in the built HTML to confirm a diagram made it through.

### Dependencies

Never regenerate the lockfile with `npm install --legacy-peer-deps`. The Dockerfile runs plain `npm ci`, which is strict: a `--legacy-peer-deps` install drops the optional `search-insights` peer from `package-lock.json`, and `npm ci` then fails with a missing-from-lockfile error. Plain `npm install` resolves cleanly. Verify any dependency change with `rm -rf node_modules && npm ci && npm run docs:build`, which is what the Docker build does.

`npm audit` flags moderate advisories chained through `vitepress -> vite -> esbuild`. Bumping `vitepress` does not clear them: the stable vitepress line pins `vite ^5.4.14` and the relevant vite patches were never backported to 5.x. The pre-release `vitepress@2.x` line pulls vite 7 but is not stable, and `vitepress-plugin-mermaid` does not support vitepress 2.x yet. Instead, `package.json` carries an `overrides` entry forcing patched transitive versions of `esbuild`, `vite` and `dompurify`; vitepress builds against the newer vite in practice. Drop the overrides once vitepress 2.x ships stable with mermaid support, and until then re-check on each flagged bump that the override targets are still the patched floor.

## Code snippets

Code examples must come from real, working code. Do not invent example code.

Snippets are pasted inline as fenced code blocks with a `<small>` source link underneath pointing at the exact file and lines on GitHub. The link uses a full commit hash so the content is pinned:

```
<small>[Source: file.ts#L20-L31](https://github.com/encryption4all/REPO/blob/HASH/path/file.ts#L20-L31)</small>
```

Source repositories:

- `encryption4all/postguard-js` (pnpm workspace): `packages/pg-js` (SDK), `apps/website`, `apps/tb-addon`, `apps/outlook-addon`, `examples/*`
- `encryption4all/postguard` (Cargo workspace): `pg-core`, `pg-pkg`, `pg-cli`, `pg-ffi`, `cryptify`
- `encryption4all/postguard-dotnet` (.NET SDK)

The `postguard-examples`, `postguard-website`, `postguard-tb-addon` and `postguard-outlook-addon` repositories are archived. Pinned links already in the docs still resolve, but new snippets come from the workspace paths above.

To add or update a snippet:

1. Fetch the file at a specific commit: `https://raw.githubusercontent.com/encryption4all/REPO/COMMIT_HASH/path/to/file.ts`
2. Copy the relevant lines into a fenced block with the right language tag.
3. Add the source link directly below the block.

Keep snippets focused. Include the lines that carry the surrounding prose, not the whole file: 10 to 30 lines is usually enough.

`npm run check:links` checks that every pinned link still resolves. It is an existence check over the GitHub contents API, so it does not compare line ranges or content.

### Fixing a broken source link

1. `curl -sI` the candidate URL and proceed only on HTTP 200.
2. Fetch the file at that hash and confirm the snippet content matches the line range. A 200 only means the file exists; the lines can still be wrong.
3. If no commit matches the snippet, remove the example and write prose pointing at the API page instead.

Snippets pinned into `postguard-examples` need care. A consolidation commit there flattened `pg-sveltekit/src/routes/download/` and `routes/send/` into a single top-level `+page.svelte`, so links pinned before it 404. The API shape changed with it, from `pg.decrypt({uuid, element, recipient})` to `pg.open({uuid}).decrypt(...)`, so those snippets cannot be repinned to a later hash without also updating the code shown.

## Vue interpolation breaks the build, even inside backticks

VitePress compiles every page as a Vue SFC, so <span v-pre>`{{ ... }}`</span> is a template interpolation wherever it appears, including inside an inline code span. This paragraph needs the `v-pre` escape it describes. Documenting a GitHub Actions expression that way fails `npm run docs:build` with `Cannot read properties of undefined (reading 'repository')` and a Vue server-renderer stack trace naming `.vitepress/.temp/<page>.md.js`, which points at the compiled temp file rather than the line you wrote.

Name the context in prose instead (the workflow's github.repository context), or wrap the span in `<span v-pre>`. A fenced code block is safe; an inline span is not. Run `npm run docs:build` before pushing, because review does not catch this class of error.

## Canonical PKG and Cryptify hosts

Source of truth: the `postguard-js/examples/pg-{node,dotnet,sveltekit}` configs.

| Environment | PKG | Cryptify |
|---|---|---|
| Staging | `pkg.staging.postguard.eu` | `storage.staging.postguard.eu` |
| Production | `pkg.postguard.eu` | `storage.postguard.eu` |

Aliases that must not appear in docs or snippets:

- `pkg.staging.yivi.app` and `fileshare.staging.yivi.app` resolve to the same IP but serve the Kubernetes placeholder certificate, so real clients fail TLS validation.
- `fileshare.postguard.eu` and `fileshare.staging.postguard.eu` are older Cryptify hostnames replaced by `storage.*`, and the `fileshare.*` subdomains no longer serve `/health` on production.

To verify: `curl -sI https://pkg.staging.postguard.eu/v2/parameters` returns HTTP 405 (a real server, GET-only) and `curl -sI https://storage.postguard.eu/health` returns 200.

## Writing style

Written content here should sound like a competent human wrote it. These rules apply to prose anywhere in the project: markdown, comments and UI copy.

### Words to replace

delve into (explore, look at), leverage and utilize and harness (use), robust (strong, reliable), comprehensive (thorough, complete), seamless (smooth, easy), cutting-edge (latest), pivotal (important, key), embark (start), landscape (field, area), tapestry (describe the actual complexity), realm (area, domain), paradigm (model, approach), testament to (shows), serves as (is), boasts (has), in order to (to), due to the fact that (because), empower (let, allow), foster (build, encourage), elevate (improve), streamline (simplify), holistic (complete), actionable (practical, useful), impactful (effective), synergy (describe the combined effect), ecosystem (system, tooling), myriad and plethora (many), transformative (say what changed), cornerstone (foundation, key part), deep dive (examine), unpack (explain), game-changer (say why it matters), genuinely (cut it).

Cut "it's important to note" and "it's worth mentioning" entirely, or just state the thing.

### Transitions

Do not open a sentence with Moreover, Furthermore, Additionally, Indeed, Notably, Consequently, Subsequently or Accordingly. Use a plain conjunction, or start a new sentence.

### Structure

- No "it's not X, it's Y" contrast framing. Make the positive statement.
- No significance inflation ("a pivotal moment", "a watershed moment"). State what happened and let the reader judge.
- No rhetorical question openers. If you know the answer, state it.
- No generic conclusions ("the future looks bright", "only time will tell"). End with something specific, or stop.
- No mechanical rule of three ("efficient, effective, and reliable"). One or two descriptors is enough.
- No synonym cycling. If "developers" is the right word, keep using it.
- No chatbot artifacts ("Certainly!", "Great question!", "I hope this helps!", "Let's dive in").
- No "let's" constructions. Start with the point.
- No "-ing" chains ("highlighting... emphasizing... facilitating..."). Use specific facts.
- No false concession ("while X is impressive, Y remains a challenge") unless the concession is specific and earned.
- No vague specificity ("various factors", "a range of considerations"). Name the things or cut them.

### Formatting

- Em dashes: target zero, hard maximum one per 1,000 words. Use commas, periods or parentheses.
- Bold: target zero, hard maximum one per 1,000 words. Do not bold for emphasis in running prose.
- Bullet lists are for genuinely parallel items (parameters, options, steps). Prose is the default.
- Headers: H2 and H3 are usually enough.
- Avoid colons in titles ("PostGuard: The Future of Email Security" becomes "PostGuard protects your email").

### Voice

Plain, direct English, common words over elevated ones. Use "is" and "are" freely. Write with calm authority and assume the reader is competent. State claims without hedging unless the uncertainty is real, and have a point of view rather than balancing every argument. Vary sentence length; short sentences are fine. Name tools, functions, files and versions rather than gesturing at them: "use the `verify()` method", not "use the appropriate verification mechanism". Keep the stakes proportional. Documentation is helpful, not revolutionary.

## Deployment

`ci.yml` builds the site and pushes a Docker image to `ghcr.io/encryption4all/postguard-docs:edge` on every push to `main`. There is no deploy step. The host running production has to pull the new `edge` image and restart the container, or it keeps serving the previous build.

To check for a stale deployment, compare the `last-modified` header on `index.html` against the latest commit date on `main`:

```bash
curl -I https://docs.postguard.eu/
```

## Agent orientation

`CLAUDE.md` in this repo is orientation only: what the repo is, where it sits, and which repos a change here touches. Detail belongs on this page; a durable check for an agent belongs in the agent rule bundle.

`npm run check:claude-md` holds it to that. It fails over 4,000 bytes, and also when a heading matching one of the cut sections comes back, because a small file can still be a junk drawer. The heading match ignores case, punctuation and heading level, so retitling a section does not get it past the gate. `npm test` covers both branches.
