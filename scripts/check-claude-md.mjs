#!/usr/bin/env node
// Fail when CLAUDE.md grows back past orientation size.
//
// CLAUDE.md is orientation: what this repo is, where it sits between the other
// repos, and which of them a change here touches. Detail belongs on this repo's
// own docs page (docs/repos/postguard-docs.md), and a durable check for an agent
// belongs in the agent rule bundle. The file was 11,680 B of accumulated notes
// before encryption4all/dobby-code#691 cut it; this check is what keeps the cut
// from being undone a paragraph at a time.
//
// The 4,000 B cap is the gate from encryption4all/dobby-code#482: above it, a
// container working this repo no longer gets its cwd pointed at the checkout.

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CLAUDE_MD = join(dirname(fileURLToPath(import.meta.url)), "..", "CLAUDE.md");

const MAX_BYTES = 4000;

// The corpus grew under these headings, so the regression is named rather than
// left to the byte count alone: any one of them returning is the same failure
// starting over, whatever the file weighs.
const DELETED_SECTIONS = [
  "Code Snippets",
  "Writing Style Rules",
  "Agent notes (migrated from the dobby memory repo)",
];

const body = await readFile(CLAUDE_MD, "utf8");
const bytes = Buffer.byteLength(body, "utf8");
const problems = [];

if (bytes > MAX_BYTES) {
  problems.push(
    `CLAUDE.md is ${bytes} B, over the ${MAX_BYTES} B cap. Move the detail to ` +
      `docs/repos/postguard-docs.md, or file it as a rule if it is a check an agent has to run.`,
  );
}

const headings = [...body.matchAll(/^#{2,6} (.+)$/gm)].map(([, h]) => h.trim());
for (const section of DELETED_SECTIONS) {
  if (headings.includes(section)) {
    problems.push(
      `CLAUDE.md has a "${section}" heading again. That section moved to ` +
        `docs/repos/postguard-docs.md; link to it instead of restoring it here.`,
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`error: ${problem}`);
  process.exit(1);
}

console.log(`CLAUDE.md is ${bytes} B, within the ${MAX_BYTES} B orientation cap.`);
