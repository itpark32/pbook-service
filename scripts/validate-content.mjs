import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../content/python");
const COMPARISON_MODES = new Set(["normalized_text", "tokens", "float_tokens"]);
const JUDGE_TYPES = new Set(["stdin_stdout", "function", "files", "manual"]);
const EXERCISE_KINDS = new Set(["guided", "checkpoint", "practicum", "manual"]);
const DIFFICULTIES = new Set(["intro", "standard", "challenge"]);
const STRUCTURAL_RULES = new Set([
  "requireFunctions",
  "forbidCalls",
  "forbidMethods",
  "forbidImports",
  "requireRecursion"
]);

function walk(directory, predicate) {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path, predicate);
    return predicate(path) ? [path] : [];
  });
}

function readJson(path, errors) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`${relative(DEFAULT_ROOT, path)}: invalid JSON (${error.message})`);
    return null;
  }
}

function addUnique(items, label, errors) {
  const seen = new Set();
  for (const item of items) {
    if (!item?.id) {
      errors.push(`${label}: missing id`);
    } else if (seen.has(item.id)) {
      errors.push(`${label}: duplicate ID ${item.id}`);
    } else {
      seen.add(item.id);
    }
  }
  return seen;
}

function safeRelativePath(path) {
  if (typeof path !== "string" || path.length === 0 || path.startsWith("/") || path.includes("\\")) {
    return false;
  }
  const normalized = normalize(path);
  return normalized !== ".." && !normalized.startsWith(`..${"/"}`) && !normalized.startsWith("../");
}

export function normalizeText(value) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/g, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

export function compareOutput(actual, expected, comparison = { mode: "normalized_text" }) {
  const mode = comparison.mode ?? "normalized_text";
  if (mode === "normalized_text") return normalizeText(actual) === normalizeText(expected);
  const actualTokens = actual.trim().split(/\s+/).filter(Boolean);
  const expectedTokens = expected.trim().split(/\s+/).filter(Boolean);
  if (actualTokens.length !== expectedTokens.length) return false;
  if (mode === "tokens") return actualTokens.every((token, index) => token === expectedTokens[index]);
  const absolute = comparison.absoluteTolerance ?? 0.000001;
  const relativeTolerance = comparison.relativeTolerance ?? 0.000001;
  return actualTokens.every((token, index) => {
    const actualNumber = Number(token);
    const expectedNumber = Number(expectedTokens[index]);
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return token === expectedTokens[index];
    return Math.abs(actualNumber - expectedNumber) <= Math.max(absolute, relativeTolerance * Math.abs(expectedNumber));
  });
}

function validateLinks(markdownFiles, contentRoot, errors, knownRoutes = new Set()) {
  for (const markdownPath of markdownFiles) {
    const text = readFileSync(markdownPath, "utf8");
    const links = text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
    for (const match of links) {
      const rawHref = match[1].trim();
      if (/^(javascript|vbscript|data):/i.test(rawHref)) {
        errors.push(`${relative(contentRoot, markdownPath)}: unsafe URL ${rawHref}`);
        continue;
      }
      const href = rawHref.split("#")[0].trim();
      if (!href || /^(https?:|mailto:|#)/.test(href)) continue;
      if (href.startsWith("/python/")) {
        if (!knownRoutes.has(href)) errors.push(`${relative(contentRoot, markdownPath)}: broken platform route ${match[1]}`);
        continue;
      }
      const target = resolve(dirname(markdownPath), href);
      if (!target.startsWith(contentRoot) || !existsSync(target)) {
        errors.push(`${relative(contentRoot, markdownPath)}: broken internal link ${match[1]}`);
      }
    }
  }
}

function validateFileList(exercise, files, contentRoot, errors) {
  if (!Array.isArray(files)) {
    errors.push(`${exercise.id}: files must be an array`);
    return;
  }
  for (const file of files) {
    if (!safeRelativePath(file.path)) errors.push(`${exercise.id}: unsafe file path ${file.path}`);
    const hasContent = typeof file.content === "string";
    const hasFixture = typeof file.fixture === "string";
    if (hasFixture && (!safeRelativePath(file.fixture) || !existsSync(resolve(contentRoot, file.fixture)))) {
      errors.push(`${exercise.id}: missing or unsafe fixture ${file.fixture}`);
    }
    if (hasContent === hasFixture) {
      errors.push(`${exercise.id}: file needs exactly one of content or fixture`);
    }
  }
}

function validateFixturePaths(exercise, contentRoot, errors) {
  for (const test of exercise.judge?.tests ?? []) {
    if (Object.hasOwn(test, "inputFiles")) validateFileList(exercise, test.inputFiles, contentRoot, errors);
    if (Object.hasOwn(test, "expectedFiles")) validateFileList(exercise, test.expectedFiles, contentRoot, errors);
  }
  for (const example of exercise.fileExamples ?? []) {
    if (typeof example.title !== "string" || !example.title) {
      errors.push(`${exercise.id}: file example needs title`);
    }
    validateFileList(exercise, example.files, contentRoot, errors);
  }
}

function resolvedFileContent(file, contentRoot) {
  if (typeof file.content === "string") return file.content;
  if (typeof file.fixture !== "string" || !safeRelativePath(file.fixture)) return "";
  const fixturePath = resolve(contentRoot, file.fixture);
  return existsSync(fixturePath) ? readFileSync(fixturePath, "utf8") : "";
}

function pathInside(directory, relativePath) {
  const path = resolve(directory, relativePath);
  if (!path.startsWith(`${directory}${sep}`)) throw new Error(`unsafe path ${relativePath}`);
  return path;
}

function runReferenceSolution(exercise, errors, contentRoot) {
  if (exercise.judge.type === "function") {
    for (const [index, test] of exercise.judge.tests.entries()) {
      const harness = `import json\nsource = ${JSON.stringify(exercise.solution)}\nname = ${JSON.stringify(exercise.judge.functionName)}\nargs = json.loads(${JSON.stringify(JSON.stringify(test.args))})\ntry:\n    namespace = {}\n    exec(compile(source, '<reference>', 'exec'), namespace)\n    function = namespace.get(name)\n    if not callable(function):\n        raise NameError(f'Function {name} is not defined')\n    value = function(*args)\n    print(json.dumps({'kind': 'return', 'value': value}, ensure_ascii=False, allow_nan=False))\nexcept BaseException as error:\n    print(json.dumps({'kind': 'exception', 'exceptionType': type(error).__name__}, ensure_ascii=False))\n`;
      const result = spawnSync("python3", ["-c", harness], { encoding: "utf8", timeout: 5100 });
      if (result.error || result.status !== 0) {
        errors.push(`${exercise.id}: reference solution fails function test ${index + 1}`);
        continue;
      }
      let outcome;
      try {
        outcome = JSON.parse(result.stdout.trim().split("\n").at(-1));
      } catch {
        errors.push(`${exercise.id}: reference solution has non-JSON function result on test ${index + 1}`);
        continue;
      }
      if (test.expectedException) {
        if (outcome.kind !== "exception" || outcome.exceptionType !== test.expectedException) {
          errors.push(`${exercise.id}: reference solution has wrong exception on test ${index + 1}`);
        }
      } else if (outcome.kind !== "return" || JSON.stringify(outcome.value) !== JSON.stringify(test.expectedReturn)) {
        errors.push(`${exercise.id}: reference solution has wrong return on test ${index + 1}`);
      }
    }
    return;
  }
  if (exercise.judge.type === "files") {
    for (const [index, test] of exercise.judge.tests.entries()) {
      const workingDirectory = mkdtempSync(join(tmpdir(), "pbook-files-reference-"));
      try {
        for (const input of test.inputFiles ?? []) {
          const path = pathInside(workingDirectory, input.path);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, resolvedFileContent(input, contentRoot), "utf8");
        }
        const result = spawnSync("python3", ["-c", exercise.solution], {
          cwd: workingDirectory,
          encoding: "utf8",
          timeout: 5100
        });
        if (result.error || result.status !== 0) {
          errors.push(`${exercise.id}: reference solution fails files test ${index + 1}: ${result.stderr || result.error?.message}`);
          continue;
        }
        const comparison = exercise.judge.comparison ?? { mode: "normalized_text" };
        if (typeof test.expectedStdout === "string" && !compareOutput(result.stdout, test.expectedStdout, comparison)) {
          errors.push(`${exercise.id}: reference solution has wrong stdout on files test ${index + 1}`);
        }
        for (const expected of test.expectedFiles ?? []) {
          const path = pathInside(workingDirectory, expected.path);
          if (!existsSync(path)) {
            errors.push(`${exercise.id}: reference solution misses output file ${expected.path} on test ${index + 1}`);
            continue;
          }
          if (!compareOutput(readFileSync(path, "utf8"), resolvedFileContent(expected, contentRoot), comparison)) {
            errors.push(`${exercise.id}: reference solution has wrong output file ${expected.path} on test ${index + 1}`);
          }
        }
      } finally {
        rmSync(workingDirectory, { recursive: true, force: true });
      }
    }
    return;
  }
  if (exercise.judge.type !== "stdin_stdout") return;
  for (const [index, test] of exercise.judge.tests.entries()) {
    const result = spawnSync("python3", ["-c", exercise.solution], {
      input: test.input,
      encoding: "utf8",
      timeout: 5100
    });
    if (result.error || result.status !== 0) {
      errors.push(`${exercise.id}: reference solution fails test ${index + 1}: ${result.stderr || result.error?.message}`);
      continue;
    }
    if (!compareOutput(result.stdout, test.expectedOutput, exercise.judge.comparison)) {
      errors.push(`${exercise.id}: reference solution has wrong output on test ${index + 1}`);
    }
  }
}

export function validateContent(contentRoot = DEFAULT_ROOT, options = {}) {
  const errors = [];
  const jsonFiles = walk(contentRoot, (path) => extname(path) === ".json");
  const byPath = new Map(jsonFiles.map((path) => [path, readJson(path, errors)]));
  const coursePath = join(contentRoot, "course.json");
  const skillsPath = join(contentRoot, "skills.json");
  const manifestPath = join(contentRoot, "source-manifest.json");
  const course = byPath.get(coursePath);
  const skills = byPath.get(skillsPath);
  const manifest = byPath.get(manifestPath);
  if (!course || !skills) throw new Error("course.json and skills.json are required");
  if (course.schemaVersion !== 1) errors.push("course.json: unsupported schemaVersion");
  const knownSkills = new Set(skills.ids ?? []);
  const sectionIds = addUnique(course.sections ?? [], "course sections", errors);
  const practicumEntries = course.practicums ?? [];
  const coursePracticumIds = addUnique(practicumEntries, "course practicums", errors);

  const lessons = [...byPath.entries()]
    .filter(([path]) => path.endsWith("lesson.json"))
    .map(([path, value]) => ({ ...value, __path: path }));
  const practicums = [...byPath.entries()]
    .filter(([path]) => path.endsWith("practicum.json"))
    .map(([path, value]) => ({ ...value, __path: path }));
  const exercises = [...byPath.entries()]
    .filter(([path]) => path.includes(`${"/"}exercises${"/"}`))
    .map(([path, value]) => ({ ...value, __path: path }));
  const lessonIds = addUnique(lessons, "lessons", errors);
  const practicumIds = addUnique(practicums, "practicums", errors);
  addUnique(exercises, "exercises", errors);

  const referencedLessonIds = new Set();
  for (const section of course.sections ?? []) {
    for (const lessonId of section.lessonIds ?? []) {
      if (!lessonIds.has(lessonId)) errors.push(`section ${section.id}: missing lesson ${lessonId}`);
      if (referencedLessonIds.has(lessonId)) errors.push(`course: lesson ${lessonId} is referenced more than once`);
      referencedLessonIds.add(lessonId);
    }
  }
  for (const lessonId of lessonIds) {
    if (!referencedLessonIds.has(lessonId)) errors.push(`course: orphan lesson ${lessonId}`);
  }
  for (const item of course.sequence ?? []) {
    if (item.type === "section" && !sectionIds.has(item.id)) errors.push(`sequence: missing section ${item.id}`);
    if (item.type === "practicum" && !coursePracticumIds.has(item.id)) errors.push(`sequence: missing practicum ${item.id}`);
  }
  for (const entry of practicumEntries) {
    if (!practicumIds.has(entry.id) || !existsSync(join(contentRoot, entry.path, "practicum.json"))) {
      errors.push(`course practicum ${entry.id}: missing practicum.json`);
    }
  }

  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const referencedExerciseIds = new Set();
  const coveredSkills = new Set();
  for (const lesson of lessons) {
    const lessonMarkdown = join(dirname(lesson.__path), "lesson.md");
    if (!sectionIds.has(lesson.sectionId)) errors.push(`${lesson.id}: missing section ${lesson.sectionId}`);
    if (!existsSync(lessonMarkdown)) errors.push(`${lesson.id}: lesson.md is missing`);
    if (!Number.isInteger(lesson.readingMinutes) || lesson.readingMinutes <= 0) errors.push(`${lesson.id}: invalid readingMinutes`);
    if (!Number.isInteger(lesson.practiceMinutes) || lesson.practiceMinutes <= 0) errors.push(`${lesson.id}: invalid practiceMinutes`);
    if (!Array.isArray(lesson.tags) || lesson.tags.length === 0) errors.push(`${lesson.id}: tags are required`);
    if (!Array.isArray(lesson.sourcePaths) || lesson.sourcePaths.length === 0) errors.push(`${lesson.id}: sourcePaths are required`);
    for (const skill of lesson.skillIds ?? []) {
      if (!knownSkills.has(skill)) errors.push(`${lesson.id}: invalid skill ID ${skill}`);
      coveredSkills.add(skill);
    }
    if (!lesson.checkpointExerciseId || !lesson.exerciseOrder?.includes(lesson.checkpointExerciseId)) {
      errors.push(`${lesson.id}: missing checkpoint in exerciseOrder`);
    }
    for (const exerciseId of lesson.exerciseOrder ?? []) {
      referencedExerciseIds.add(exerciseId);
      const exercise = exerciseById.get(exerciseId);
      if (!exercise) errors.push(`${lesson.id}: missing exercise ${exerciseId}`);
      else if (exercise.owner?.type !== "lesson" || exercise.owner?.id !== lesson.id) {
        errors.push(`${exerciseId}: incorrect lesson owner`);
      }
    }
    if ((lesson.exerciseOrder?.length ?? 0) < 3) errors.push(`${lesson.id}: lesson needs at least 3 exercises`);
    const checkpoint = exerciseById.get(lesson.checkpointExerciseId);
    if (checkpoint && checkpoint.kind !== "checkpoint") errors.push(`${lesson.id}: checkpoint exercise must have kind checkpoint`);
  }
  for (const practicum of practicums) {
    for (const skill of practicum.skillIds ?? []) if (!knownSkills.has(skill)) errors.push(`${practicum.id}: invalid skill ID ${skill}`);
    for (const exerciseId of practicum.exerciseOrder ?? []) {
      referencedExerciseIds.add(exerciseId);
      const exercise = exerciseById.get(exerciseId);
      if (!exercise) errors.push(`${practicum.id}: missing exercise ${exerciseId}`);
      else if (exercise.owner?.type !== "practicum" || exercise.owner?.id !== practicum.id) errors.push(`${exerciseId}: incorrect practicum owner`);
    }
  }
  for (const exercise of exercises) {
    if (!referencedExerciseIds.has(exercise.id)) errors.push(`${exercise.id}: orphan exercise`);
  }
  for (const skill of course.requiredSkillIds ?? []) {
    if (!knownSkills.has(skill)) errors.push(`course: invalid required skill ${skill}`);
    if (!coveredSkills.has(skill)) errors.push(`curriculum: missing required skill ${skill}`);
  }
  if (!manifest || typeof manifest.commit !== "string" || !/^[0-9a-f]{40}$/.test(manifest.commit)) {
    errors.push("source-manifest.json: valid source commit is required");
  }
  const manifestedSources = new Set((manifest?.files ?? []).map((file) => file.path));
  for (const lesson of lessons) {
    for (const sourcePath of lesson.sourcePaths ?? []) {
      if (!sourcePath.startsWith("authored:") && !manifestedSources.has(sourcePath)) {
        errors.push(`${lesson.id}: source ${sourcePath} is missing from source manifest`);
      }
    }
  }
  if (manifest?.importedThroughBatch === "F") {
    const expectedSkills = Array.from({ length: 44 }, (_, index) => `SK${String(index + 1).padStart(2, "0")}`);
    for (const skill of expectedSkills) {
      if (!(course.requiredSkillIds ?? []).includes(skill)) errors.push(`curriculum: final import is missing ${skill}`);
    }
    if (lessons.length !== 47) errors.push(`curriculum: final import needs 47 lessons, got ${lessons.length}`);
    if (practicums.length !== 6) errors.push(`curriculum: final import needs 6 practicums, got ${practicums.length}`);
    if (exercises.length < 230) errors.push(`curriculum: final import needs at least 230 exercises, got ${exercises.length}`);
  }
  for (const exercise of exercises) {
    if (exercise.schemaVersion !== 1) errors.push(`${exercise.id}: unsupported schemaVersion`);
    if (!EXERCISE_KINDS.has(exercise.kind)) errors.push(`${exercise.id}: invalid exercise kind`);
    if (!DIFFICULTIES.has(exercise.difficulty)) errors.push(`${exercise.id}: invalid difficulty`);
    for (const field of ["title", "statement", "starterCode", "solution"]) {
      if (typeof exercise[field] !== "string" || exercise[field].trim() === "") {
        errors.push(`${exercise.id}: ${field} must be non-empty`);
      }
    }
    if (!Array.isArray(exercise.hints) || exercise.hints.length < 2 || exercise.hints.some((hint) => typeof hint !== "string" || !hint.trim())) {
      errors.push(`${exercise.id}: needs at least two non-empty hints`);
    }
    if (!JUDGE_TYPES.has(exercise.judge?.type)) errors.push(`${exercise.id}: invalid judge type`);
    if (exercise.judge?.type !== "manual" && (!(exercise.judge?.tests?.length) || !exercise.solution)) {
      errors.push(`${exercise.id}: auto-checked exercise needs tests and solution`);
    }
    if (exercise.judge?.type !== "manual" && exercise.judge.tests.length < 3) {
      errors.push(`${exercise.id}: auto-checked exercise needs at least three tests`);
    }
    if (exercise.judge?.comparison && !COMPARISON_MODES.has(exercise.judge.comparison.mode)) {
      errors.push(`${exercise.id}: invalid comparison mode`);
    }
    if (exercise.judge?.type === "function") {
      if (typeof exercise.judge.functionName !== "string" || !exercise.judge.functionName) {
        errors.push(`${exercise.id}: function judge needs functionName`);
      }
      for (const test of exercise.judge.tests ?? []) {
        const hasReturn = Object.hasOwn(test, "expectedReturn");
        const hasException = typeof test.expectedException === "string";
        if (!Array.isArray(test.args) || hasReturn === hasException) {
          errors.push(`${exercise.id}: function test needs args and exactly one expected result`);
        }
      }
    }
    if (exercise.judge?.type === "files") {
      for (const test of exercise.judge.tests ?? []) {
        if (!Array.isArray(test.inputFiles)) {
          errors.push(`${exercise.id}: files test needs inputFiles`);
        }
        if (
          typeof test.expectedStdout !== "string" &&
          (!Array.isArray(test.expectedFiles) || test.expectedFiles.length === 0)
        ) {
          errors.push(`${exercise.id}: files test needs expected stdout or output file`);
        }
      }
    }
    if (exercise.judge?.structuralConstraints) {
      for (const [rule, values] of Object.entries(exercise.judge.structuralConstraints)) {
        if (!STRUCTURAL_RULES.has(rule) || !Array.isArray(values) || values.some((value) => typeof value !== "string" || !value)) {
          errors.push(`${exercise.id}: invalid structural constraint ${rule}`);
        }
      }
    }
    validateFixturePaths(exercise, contentRoot, errors);
    if (options.solutions !== false) runReferenceSolution(exercise, errors, contentRoot);
  }
  const practicumStatements = new Map();
  for (const practicum of practicums) {
    for (const exerciseId of practicum.exerciseOrder ?? []) {
      const exercise = exerciseById.get(exerciseId);
      if (!exercise) continue;
      const previous = practicumStatements.get(exercise.statement);
      if (previous) errors.push(`${practicum.id}: duplicate practicum statement in ${previous} and ${exercise.id}`);
      practicumStatements.set(exercise.statement, exercise.id);
    }
  }
  const checkpointStatements = new Set(exercises.filter((exercise) => exercise.kind === "checkpoint").map((exercise) => exercise.statement));
  for (const practicum of practicums) {
    for (const exerciseId of practicum.exerciseOrder ?? []) {
      const exercise = exerciseById.get(exerciseId);
      if (exercise && checkpointStatements.has(exercise.statement)) errors.push(`${exercise.id}: practicum statement duplicates a lesson checkpoint`);
    }
  }
  const knownRoutes = new Set([
    ...lessons.map((lesson) => `/python/${lesson.sectionId}/${lesson.slug}`),
    ...practicums.map((practicum) => `/python/practicums/${practicum.slug}`)
  ]);
  validateLinks(walk(contentRoot, (path) => extname(path) === ".md"), contentRoot, errors, knownRoutes);
  if (errors.length > 0) throw new Error(`Content validation failed:\n- ${errors.join("\n- ")}`);
  return { lessons: lessons.length, exercises: exercises.length, practicums: practicums.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const summary = validateContent(DEFAULT_ROOT, { solutions: true });
    console.log(`Content valid: ${summary.lessons} lesson(s), ${summary.exercises} exercise(s), ${summary.practicums} practicum(s).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
