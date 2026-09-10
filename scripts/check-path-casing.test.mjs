import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { checkRepository, findCaseCollisions } from "./check-path-casing.mjs";

test("findCaseCollisions reports repository paths that differ only by case", () => {
  const collisions = findCaseCollisions(["src/Feature.ts", "src/feature.ts", "src/other.ts"]);

  assert.deepEqual(collisions, [["src/Feature.ts", "src/feature.ts"]]);
});

test("checkRepository reports a relative import with the wrong casing", () => {
  const root = mkdtempSync(join(tmpdir(), "opencodexui-path-casing-"));

  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "Feature.ts"), "export const feature = true;\n");
    writeFileSync(join(root, "src", "main.ts"), 'import { feature } from "./feature";\n');

    const result = checkRepository(root);

    assert.equal(result.pathCollisions.length, 0);
    assert.deepEqual(result.importIssues, [
      {
        file: "src/main.ts",
        line: 1,
        specifier: "./feature",
        actualPath: "src/Feature.ts"
      }
    ]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("checkRepository accepts an import whose casing matches the file", () => {
  const root = mkdtempSync(join(tmpdir(), "opencodexui-path-casing-"));

  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "Feature.ts"), "export const feature = true;\n");
    writeFileSync(join(root, "src", "main.ts"), 'import { feature } from "./Feature";\n');

    const result = checkRepository(root);

    assert.deepEqual(result.pathCollisions, []);
    assert.deepEqual(result.importIssues, []);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
