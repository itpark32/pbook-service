import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContent } from "./validate-content.mjs";
import { practicumProfiles, validateAuthoringProfiles } from "./exercise-factories.mjs";
import { practicums } from "./curriculum-map.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contentRoot = join(projectRoot, "content/python");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});

const content = validateContent(contentRoot, { solutions: true });
assert.deepEqual(content, { lessons: 49, exercises: 239, practicums: 6 });
assert.deepEqual(validateAuthoringProfiles(), [], "authoring profiles must be complete");
for (const practicum of practicums) {
  assert.equal(practicumProfiles[practicum.id]?.length, practicum.count, `${practicum.id} needs its explicit curated task count`);
}

const course = json(join(contentRoot, "course.json"));
const sourceManifest = json(join(contentRoot, "source-manifest.json"));
const practicumExercises = walk(join(contentRoot, "practicums"))
  .filter((path) => path.includes("/exercises/") && path.endsWith(".json"))
  .map(json);

assert.equal(practicumExercises.length, 92, "exactly 92 practicum task slots are required");
assert.ok(practicumExercises.every((item) => item.owner?.type === "practicum"), "each practicum task needs a practicum owner");
assert.deepEqual(
  new Set(course.requiredSkillIds),
  new Set(Array.from({ length: 46 }, (_, index) => `SK${String(index + 1).padStart(2, "0")}`)),
  "SK01–SK46 must be required"
);

const forbiddenSourceParts = [
  "python-plus/modules.md",
  "python-plus/classes.md",
  "python-plus/dataclass.md",
  "exams/oge.md",
  "exams/ege.md",
  "exams/navigator.md"
];
const importedSources = sourceManifest.files.map((file) => file.path);
assert.ok(
  importedSources.every((path) => !forbiddenSourceParts.some((forbidden) => path.endsWith(forbidden))),
  "exam and excluded Python+ source chapters must not be imported"
);

console.log("Final acceptance passed: 49 lessons, 6 practicums, 92 practicum tasks, SK01–SK46, valid references and permitted source set.");
