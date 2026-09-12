import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContent } from "./validate-content.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contentRoot = join(projectRoot, "content/python");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});

const content = validateContent(contentRoot, { solutions: true });
assert.deepEqual(content, { lessons: 47, exercises: 230, practicums: 6 });

const course = json(join(contentRoot, "course.json"));
const sourceManifest = json(join(contentRoot, "source-manifest.json"));
const practicumExercises = walk(join(contentRoot, "practicums"))
  .filter((path) => path.includes("/exercises/") && path.endsWith(".json"))
  .map(json);

assert.equal(practicumExercises.length, 89, "exactly 89 practicum task slots are required");
assert.ok(practicumExercises.every((item) => item.owner?.type === "practicum"), "each practicum task needs a practicum owner");
assert.deepEqual(
  new Set(course.requiredSkillIds),
  new Set(Array.from({ length: 44 }, (_, index) => `SK${String(index + 1).padStart(2, "0")}`)),
  "SK01–SK44 must be required"
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

console.log("Final acceptance passed: 47 lessons, 6 practicums, 89 practicum tasks, SK01–SK44, valid references and permitted source set.");
