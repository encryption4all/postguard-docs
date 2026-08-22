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
  { stem: "code snippets", went: "docs/repos/postguard-docs.md#code-snippets" },
  { stem: "writing style", went: "docs/repos/postguard-docs.md#writing-style" },
  { stem: "agent notes", went: "the agent rule bundle, as one rule per check" },
];

// Compared on letters and digits alone, so case, punctuation and heading level
// cannot smuggle a section back in. A reworded title that drops the section's
// own words ("Style guide") is not caught, and the byte cap is what holds then.
const normalise = (heading) => heading.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// A "# ..." line inside a fenced block is a shell comment or a diff marker, not
// a heading, and reporting one sends the reader looking for a section that is
// not there. Fences are matched on their own opening run so an inner fence of a
// different character or length does not close the block early.
function withoutFencedBlocks(body) {
  const lines = body.split("\n");
  const kept = [];
  let fence = null;
  for (const line of lines) {
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      kept.push("");
      continue;
    }
    if (open) {
      fence = open[1];
      kept.push("");
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

// Setext headings are the other half of the syntax: an h1 or h2 written as the
// text with "===" or "---" under it. They are as much a restored section as the
// ATX form, and a gate that only knows "##" reads one as ordinary prose.
function headingsIn(body) {
  const scannable = withoutFencedBlocks(body);
  const found = [...scannable.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, text]) => text);

  const lines = scannable.split("\n");
  for (let i = 1; i < lines.length; i++) {
    if (!/^ {0,3}(=+|-+)\s*$/.test(lines[i])) continue;
    const text = lines[i - 1].trim();
    // An underline needs text above it; a "---" over a blank line is a thematic
    // break or the close of a front-matter block, not a heading.
    if (text !== "" && !/^ {0,3}#/.test(text)) found.push(text);
  }

  return found.map((text) => ({ text: text.trim(), normalised: normalise(text) }));
}

export function problemsFor(body) {
  const problems = [];
  const bytes = Buffer.byteLength(body, "utf8");

  if (bytes > MAX_BYTES) {
    problems.push(
      `CLAUDE.md is ${bytes} B, over the ${MAX_BYTES} B cap. Move the detail to ` +
        `docs/repos/postguard-docs.md, or file it as a rule if it is a check an agent has to run.`,
    );
  }

  const headings = headingsIn(body);

  for (const { stem, went } of DELETED_SECTIONS) {
    const hit = headings.find((heading) => heading.normalised.includes(stem));
    if (hit) {
      problems.push(
        `CLAUDE.md has a "${hit.text}" heading again. That section moved to ${went}; ` +
          `restoring it here undoes the cut.`,
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
