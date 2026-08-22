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
import { fileURLToPath, pathToFileURL } from "node:url";

const CLAUDE_MD = join(dirname(fileURLToPath(import.meta.url)), "..", "CLAUDE.md");

export const MAX_BYTES = 4000;

// The corpus grew under these headings, so the regression is named rather than
// left to the byte count alone: any one of them returning is the same failure
// starting over, whatever the file weighs. Each entry is the stem the heading
// was built on, not the heading as it was written -- whoever restores a section
// retitles it on the way ("Writing style", "Agent notes"), and a gate that only
// knows the old wording waves all of those through.
const DELETED_SECTIONS = [
  { stem: "code snippets", page: "the snippet conventions" },
  { stem: "writing style", page: "the writing style rules" },
  { stem: "agent notes", page: "the agent notes" },
];

// Compared on letters and digits alone, so case, punctuation and heading level
// cannot smuggle a section back in.
const normalise = (heading) => heading.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function problemsFor(body) {
  const problems = [];
  const bytes = Buffer.byteLength(body, "utf8");

  if (bytes > MAX_BYTES) {
    problems.push(
      `CLAUDE.md is ${bytes} B, over the ${MAX_BYTES} B cap. Move the detail to ` +
        `docs/repos/postguard-docs.md, or file it as a rule if it is a check an agent has to run.`,
    );
  }

  const headings = [...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, text]) => ({
    text: text.trim(),
    normalised: normalise(text),
  }));

  for (const { stem, page } of DELETED_SECTIONS) {
    const hit = headings.find((heading) => heading.normalised.includes(stem));
    if (hit) {
      problems.push(
        `CLAUDE.md has a "${hit.text}" heading again. That section moved to ` +
          `docs/repos/postguard-docs.md (${page}); link to it instead of restoring it here.`,
      );
    }
  }

  return problems;
}

// Only runs the check when invoked as a script; the test imports problemsFor.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const body = await readFile(CLAUDE_MD, "utf8");
  const problems = problemsFor(body);

  if (problems.length > 0) {
    for (const problem of problems) console.error(`error: ${problem}`);
    process.exit(1);
  }

  console.log(
    `CLAUDE.md is ${Buffer.byteLength(body, "utf8")} B, within the ${MAX_BYTES} B orientation cap.`,
  );
}
