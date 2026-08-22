// Regression test for the CLAUDE.md orientation gate.
//
// Node's built-in test runner, so it needs no dependency installed -- the same
// constraint the script under test holds itself to.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { problemsFor, MAX_BYTES } from "./check-claude-md.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const ORIENTATION = `# postguard-docs

This repo is docs.postguard.eu.

## Where this sits

One company, two GitHub orgs.
`;

test("the committed CLAUDE.md passes the gate", async () => {
  const body = await readFile(join(ROOT, "CLAUDE.md"), "utf8");
  assert.deepEqual(problemsFor(body), []);
  assert.ok(Buffer.byteLength(body, "utf8") <= MAX_BYTES);
});

test("a file over the cap fails on its size", () => {
  const problems = problemsFor(ORIENTATION + "filler. ".repeat(MAX_BYTES / 4));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /over the 4000 B cap/);
});

// The gate used to compare headings with an exact, case-sensitive string match
// at levels 2-6 only, so every retitling of a deleted section below passed it
// and the byte cap was the only thing left standing.
for (const heading of [
  "## Writing Style Rules",
  "## Writing style",
  "## Writing Style rules",
  "## WRITING STYLE",
  "## Code Snippets",
  "## Code snippets",
  "# Code Snippets",
  "###### Code snippets, pinned",
  "## Agent notes",
  "## Agent notes (migrated from the dobby memory repo)",
]) {
  test(`a restored "${heading}" fails on the heading`, () => {
    const problems = problemsFor(`${ORIENTATION}\n${heading}\n\nthe corpus, again.\n`);
    assert.equal(problems.length, 1, `expected exactly one problem, got ${problems.join("; ")}`);
    assert.match(problems[0], /heading again/);
  });
}

// Orientation prose mentions snippets and the style rules in passing; only a
// heading is the section coming back.
test("body text naming a deleted section is not a problem", () => {
  const body = `${ORIENTATION}
Code snippets are copied out of those repos and pinned to a commit hash. The
writing style rules and the agent notes are on the repo's own page.
`;
  assert.deepEqual(problemsFor(body), []);
});
