import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareOutput, validateContent } from "./validate-content.mjs";

const source = new URL("../content/python/", import.meta.url);
const temporary = mkdtempSync(join(tmpdir(), "pbook-content-"));
cpSync(source, temporary, { recursive: true });

try {
  assert.deepEqual(validateContent(temporary, { solutions: false }), {
    lessons: 47,
    exercises: 230,
    practicums: 6
  });
  assert.equal(compareOutput("30   \n", "30\n"), true);
  assert.equal(compareOutput("3 0", "30", { mode: "normalized_text" }), false);
  assert.equal(compareOutput("1.0000004", "1", { mode: "float_tokens" }), true);

  const functionPath = join(temporary, "sections/functions/basics/exercises/01-guided.json");
  const functionExercise = JSON.parse(readFileSync(functionPath, "utf8"));
  functionExercise.judge.structuralConstraints = { unknownRule: ["value"] };
  writeFileSync(functionPath, JSON.stringify(functionExercise));
  assert.throws(() => validateContent(temporary, { solutions: false }), /invalid structural constraint unknownRule/);
  delete functionExercise.judge.structuralConstraints;
  const originalSolution = functionExercise.solution;
  functionExercise.solution = "def is_even(number):\n    return False\n";
  writeFileSync(functionPath, JSON.stringify(functionExercise));
  assert.throws(() => validateContent(temporary), /wrong return on test/);
  functionExercise.solution = originalSolution;
  writeFileSync(functionPath, JSON.stringify(functionExercise));

  const duplicatePath = join(temporary, "sections/functions/basics/exercises/duplicate.json");
  writeFileSync(duplicatePath, readFileSync(functionPath));
  assert.throws(() => validateContent(temporary, { solutions: false }), /duplicate ID/);
  unlinkSync(duplicatePath);

  const lessonPath = join(temporary, "sections/branches/if-else/lesson.json");
  const lesson = JSON.parse(readFileSync(lessonPath, "utf8"));
  const originalCheckpoint = lesson.checkpointExerciseId;
  lesson.checkpointExerciseId = "missing";
  writeFileSync(lessonPath, JSON.stringify(lesson));
  assert.throws(() => validateContent(temporary, { solutions: false }), /missing checkpoint|missing exercise missing/);
  lesson.checkpointExerciseId = originalCheckpoint;
  lesson.sourcePaths = ["docs/not-imported.md"];
  writeFileSync(lessonPath, JSON.stringify(lesson));
  assert.throws(() => validateContent(temporary, { solutions: false }), /missing from source manifest/);

  console.log("validator tests passed");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
