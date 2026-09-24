// Regression test for postguard-docs's renovate.json.
//
// Node's built-in test runner, so it needs no dependency installed -- the same
// constraint the config itself holds (it is read as plain JSON, not required
// through Renovate's own tooling).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readConfig() {
  const body = await readFile(join(ROOT, "renovate.json"), "utf8");
  return JSON.parse(body);
}

// packageRules can carry their own "automerge", so a top-level-only check
// would miss one buried in a rule. Walk the whole parsed config instead.
function hasAutomergeTrue(value) {
  if (Array.isArray(value)) return value.some(hasAutomergeTrue);
  if (value && typeof value === "object") {
    if (value.automerge === true) return true;
    return Object.values(value).some(hasAutomergeTrue);
  }
  return false;
}

test("renovate.json extends the fleet preset", async () => {
  const config = await readConfig();
  assert.ok(Array.isArray(config.extends), "renovate.json must have an extends array");
  assert.ok(
    config.extends.includes("github>encryption4all/renovate-config"),
    "renovate.json must extend github>encryption4all/renovate-config",
  );
});

test("renovate.json bumps ranges, since the site is an app and not a published library", async () => {
  const config = await readConfig();
  assert.equal(config.rangeStrategy, "bump");
});

test("renovate.json never sets automerge: true, anywhere in the config", async () => {
  const config = await readConfig();
  assert.equal(hasAutomergeTrue(config), false);
});
