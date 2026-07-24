#!/usr/bin/env node
// Verify that every pinned GitHub source link in docs/ still resolves.
//
// Docs snippets carry a source link pinned to a full commit hash, e.g.
//   https://github.com/<owner>/<repo>/blob/<hash>/<path>#L20-L31
// (see CLAUDE.md). This script checks each such link exists via the GitHub
// contents API with ref=<hash>. It is an HTTP existence check only: it does
// not compare line ranges or snippet content against the file.
//
// Set GITHUB_TOKEN or GH_TOKEN in the environment so private repos resolve
// and the unauthenticated rate limit (60 req/hour) is lifted.

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");

// owner / repo / 7-40 hex hash / path, stopping the path at # (line fragment)
// or any character that would end the link in markdown/HTML.
const LINK_RE =
  /https:\/\/github\.com\/([^/\s)"'<>]+)\/([^/\s)"'<>]+)\/blob\/([0-9a-fA-F]{7,40})\/([^\s)"'<>#]+)/g;

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

// The path in a blob URL is percent-encoded (e.g. %28app%29, %2Bpage.svelte).
// Decode each segment, then re-encode for the API path so characters like
// "+" survive as %2B rather than being read as a space.
function apiPath(rawPath) {
  return rawPath
    .split("/")
    .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
    .join("/");
}

async function main() {
  const files = await collectFiles(DOCS_DIR);
  const links = new Map(); // url -> {owner, repo, hash, path}
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const m of text.matchAll(LINK_RE)) {
      const [url, owner, repo, hash, path] = m;
      if (!links.has(url)) links.set(url, { owner, repo, hash, path });
    }
  }

  if (links.size === 0) {
    console.log("No pinned source links found in docs/.");
    return;
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.warn(
      "Warning: no GITHUB_TOKEN/GH_TOKEN set. Private repos will 404 and the " +
        "unauthenticated rate limit (60 req/hour) may be hit.",
    );
  }
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "postguard-docs-link-checker",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  console.log(`Checking ${links.size} pinned source link(s)...`);

  const broken = []; // link is gone (404)
  const unverified = []; // could not confirm (rate limit, auth, network, 5xx)

  for (const [url, { owner, repo, hash, path }] of links) {
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath(path)}?ref=${hash}`;
    let status;
    try {
      const res = await fetch(api, { headers });
      status = res.status;
    } catch (err) {
      unverified.push({ url, reason: `network error: ${err.message}` });
      continue;
    }
    if (status === 200) continue;
    if (status === 404) {
      broken.push({ url });
    } else {
      unverified.push({ url, reason: `HTTP ${status}` });
    }
  }

  if (broken.length > 0) {
    console.error(`\n${broken.length} broken source link(s) (404):`);
    for (const { url } of broken) console.error(`  ${url}`);
  }
  if (unverified.length > 0) {
    console.error(`\n${unverified.length} link(s) could not be verified:`);
    for (const { url, reason } of unverified)
      console.error(`  ${url} (${reason})`);
  }

  if (broken.length > 0 || unverified.length > 0) {
    process.exitCode = 1;
    return;
  }
  console.log("All pinned source links resolve.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
