import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const content = join(root, "content/python");
function digestTree(directory, include = () => true) {
  const hash = createHash("sha256");
  const walk = (path) => readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach((entry) => {
    const target = join(path, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (include(target)) { hash.update(target.slice(content.length)); hash.update(readFileSync(target)); }
  });
  walk(directory);
  return hash.digest("hex");
}
const isExercise = (path) => path.includes("/exercises/");
const exercisesBefore = digestTree(join(content, "sections"), isExercise);
const practicumsBefore = digestTree(join(content, "practicums"));
const result = spawnSync("node", ["scripts/import-metodichka.mjs", "--through=F", "--theory-only"], { cwd: root, encoding: "utf8" });
assert.equal(result.status, 0, result.stderr);
assert.equal(digestTree(join(content, "sections"), isExercise), exercisesBefore, "theory-only import must not modify lesson exercise files");
assert.equal(digestTree(join(content, "practicums")), practicumsBefore, "theory-only import must not modify practicum files");
console.log("Theory-only import preserves exercises and practicums.");
