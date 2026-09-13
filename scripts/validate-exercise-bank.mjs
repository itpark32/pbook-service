import { lessons, practicums } from "./curriculum-map.mjs";
import { lessonExercises, practicumExercises, validateAuthoringProfiles } from "./exercise-factories.mjs";

const errors = validateAuthoringProfiles();
const ids = new Set();
const statements = new Set();
const difficulties = new Set(["intro", "standard", "challenge"]);

for (const lesson of lessons) {
  const exercises = lessonExercises(lesson);
  if (exercises.length !== 3) errors.push(`${lesson.id}: expected 3 exercises`);
  for (const exercise of exercises) {
    if (ids.has(exercise.id)) errors.push(`duplicate ID ${exercise.id}`);
    ids.add(exercise.id);
    if (!exercise.title || !exercise.statement || !exercise.solution || !exercise.starterCode && exercise.judge.type === "function") errors.push(`${exercise.id}: incomplete authoring fields`);
    if ((exercise.hints ?? []).length < 2) errors.push(`${exercise.id}: insufficient hints`);
    if ((exercise.judge.tests ?? []).length < 3) errors.push(`${exercise.id}: insufficient tests`);
    if (!difficulties.has(exercise.difficulty ?? (exercise.id.endsWith("guided-1") ? "intro" : exercise.id.endsWith("guided-2") ? "standard" : "challenge"))) errors.push(`${exercise.id}: invalid difficulty`);
  }
}

for (const practicum of practicums) {
  const exercises = practicumExercises(practicum);
  if (exercises.length !== practicum.count) errors.push(`${practicum.id}: expected ${practicum.count} tasks`);
  const localStatements = new Set();
  for (const exercise of exercises) {
    if (ids.has(exercise.id)) errors.push(`duplicate ID ${exercise.id}`);
    ids.add(exercise.id);
    if (localStatements.has(exercise.statement)) errors.push(`${practicum.id}: duplicate statement`);
    localStatements.add(exercise.statement);
    statements.add(exercise.statement);
    if (!exercise.title || !exercise.statement || !exercise.solution || (exercise.hints ?? []).length < 2 || (exercise.judge.tests ?? []).length < 3) {
      errors.push(`${exercise.id}: incomplete curated task`);
    }
    if (!difficulties.has(exercise.difficulty)) errors.push(`${exercise.id}: invalid difficulty`);
  }
}

if (errors.length) throw new Error(`Exercise-bank validation failed:\n- ${errors.join("\n- ")}`);
console.log(`Exercise-bank source valid: ${lessons.length} lessons × 3, ${practicums.length} practicums, ${ids.size} exercises.`);
