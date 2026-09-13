import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lessonExercises, practicumExercises } from "./exercise-factories.mjs";
import { lessons, practicums, sections } from "./curriculum-map.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = join(projectRoot, "content/python");
const sourceRoot = resolve(process.argv.find((value) => value.startsWith("--source="))?.slice(9) ?? join(projectRoot, "../python-school-metodichka"));
const through = (process.argv.find((value) => value.startsWith("--through="))?.slice(10) ?? "F").toUpperCase();
const theoryOnly = process.argv.includes("--theory-only");
const reset = process.argv.includes("--reset");
const batches = ["A", "B", "C", "D", "E", "F"];

if (!batches.includes(through)) throw new Error(`Unknown batch ${through}; expected A–F`);
if (theoryOnly && reset) throw new Error("--theory-only cannot be combined with --reset: theory import must not remove practice data");
const includedBatches = batches.slice(0, batches.indexOf(through) + 1);
const includedLessons = lessons.filter((item) => includedBatches.includes(item.batch));
const includedPracticums = practicums.filter((item) => includedBatches.includes(item.batch));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const ensureDirectory = (path) => mkdirSync(path, { recursive: true });
const authoredPath = (item) => join(projectRoot, "content-source/python/sections", item.sectionId, `${item.slug}.md`);

function lessonMarkdown(item) {
  const path = authoredPath(item);
  if (!existsSync(path)) throw new Error(`${item.id}: local authored article is missing: ${path}`);
  return `${readFileSync(path, "utf8").replace(/\r\n?/g, "\n").trimEnd()}\n`;
}

function writeLesson(item, writeExercises) {
  const directory = join(contentRoot, "sections", item.sectionId, item.slug);
  const exercises = lessonExercises(item);
  ensureDirectory(directory);
  writeFileSync(join(directory, "lesson.md"), lessonMarkdown(item));
  writeFileSync(join(directory, "lesson.json"), json({
    schemaVersion: 1, id: item.id, sectionId: item.sectionId, title: item.title, slug: item.slug,
    readingMinutes: item.sectionId === "graphs" ? 18 : 15, practiceMinutes: item.batch === "F" ? 40 : 30,
    tags: ["python", `batch_${item.batch.toLowerCase()}`, ...item.skillIds.map((skill) => skill.toLowerCase())],
    skillIds: item.skillIds, sourcePaths: item.sources.length ? item.sources : ["authored:local"],
    localSourcePath: `content-source/python/sections/${item.sectionId}/${item.slug}.md`,
    exerciseOrder: exercises.map((exercise) => exercise.id), checkpointExerciseId: exercises.at(-1).id
  }));
  if (!writeExercises) return;
  const exerciseDirectory = join(directory, "exercises");
  ensureDirectory(exerciseDirectory);
  exercises.forEach((exercise, index) => writeFileSync(join(exerciseDirectory, index === 2 ? "checkpoint.json" : `${String(index + 1).padStart(2, "0")}-guided.json`), json(exercise)));
}

function writePracticum(definition) {
  const directory = join(contentRoot, "practicums", definition.slug);
  const exercises = practicumExercises(definition);
  ensureDirectory(join(directory, "exercises"));
  const availableLessons = includedLessons.filter((item) => batches.indexOf(item.batch) <= batches.indexOf(definition.batch));
  writeFileSync(join(directory, "practicum.json"), json({ schemaVersion: 1, id: definition.id, title: definition.title, slug: definition.slug, skillIds: [...new Set(availableLessons.flatMap((item) => item.skillIds))], exerciseOrder: exercises.map((exercise) => exercise.id) }));
  exercises.forEach((exercise, index) => writeFileSync(join(directory, "exercises", `${String(index + 1).padStart(2, "0")}.json`), json(exercise)));
}

function buildCourse() {
  const activeSections = sections.map((section) => ({ ...section, lessonIds: includedLessons.filter((item) => item.sectionId === section.id).map((item) => item.id) })).filter((section) => section.lessonIds.length);
  const sequence = [];
  for (const batch of includedBatches) {
    for (const section of activeSections.filter((entry) => includedLessons.some((item) => item.batch === batch && item.sectionId === entry.id))) sequence.push({ type: "section", id: section.id });
    sequence.push({ type: "practicum", id: includedPracticums.find((item) => item.batch === batch).id });
  }
  return { schemaVersion: 1, id: "python", title: "Python для школьников", description: "Последовательный курс алгоритмического программирования на Python", requiredSkillIds: [...new Set(includedLessons.flatMap((item) => item.skillIds))], sections: activeSections, practicums: includedPracticums.map((item) => ({ id: item.id, title: item.title, path: `practicums/${item.slug}` })), sequence };
}

function sourceManifest() {
  const upstreamFiles = [...new Set(includedLessons.flatMap((item) => item.sources))];
  const upstreamCommit = existsSync(join(sourceRoot, ".git")) ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).trim() : "unavailable";
  return { schemaVersion: 2, repository: "https://github.com/itpark32/python-school-metodichka", upstreamCommit, importedThroughBatch: through, importMode: "local-authored-theory", files: upstreamFiles.map((path) => ({ path, sha256: existsSync(join(sourceRoot, path)) ? sha256(readFileSync(join(sourceRoot, path), "utf8")) : "missing" })), localLessons: includedLessons.map((item) => ({ id: item.id, path: `content-source/python/sections/${item.sectionId}/${item.slug}.md`, sha256: sha256(lessonMarkdown(item)) })) };
}

function writeReports(manifest, course) {
  const totalSkills = new Set(lessons.flatMap((item) => item.skillIds)).size;
  writeFileSync(join(projectRoot, "docs/import-report.md"), ["# Отчёт импорта теории", "", `Контекст методички: \`itpark32/python-school-metodichka\`, commit \`${manifest.upstreamCommit}\`.`, "Финальные статьи не являются механической нарезкой MkDocs: они поддерживаются как локальные авторские Markdown-источники с отдельным hash в source-manifest.", `Импортирован пакет: **A–${through}**. Уроков: **${includedLessons.length}**, практикумов: **${course.practicums.length}**.`, "", "## Гарантии импорта", "", "- `--theory-only` перезаписывает только `lesson.md`, `lesson.json` и отчёты; задачи, их идентификаторы и практикумы не затрагиваются;", "- upstream path и commit остаются provenance-сигналом, но текст урока редактируется локально;", "- новые или изменённые статьи проходят content-linter до публикации.", ""].join("\n"));
  writeFileSync(join(projectRoot, "docs/curriculum-coverage.md"), ["# Покрытие учебной программы", "", `Срез после пакета **${through}**. Покрыто навыков: **${course.requiredSkillIds.length} / ${totalSkills}**.`, "", "| Навык | Уроки | Задачи урока |", "| --- | --- | ---: |", ...course.requiredSkillIds.map((skill) => `| ${skill} | ${includedLessons.filter((item) => item.skillIds.includes(skill)).map((item) => `\`${item.id}\``).join(", ")} | 3 |`), ""].join("\n"));
}

function writeBackendCatalog() {
  writeFileSync(join(projectRoot, "backend/course_catalog_generated.go"), ["// Code generated by scripts/import-metodichka.mjs; DO NOT EDIT.", "package main", "", "var teacherCourseLessons = []string{", ...includedLessons.map((item) => `\t${JSON.stringify(item.id)},`), "}", "", `const teacherCourseExerciseCount = ${includedLessons.length * 3 + includedPracticums.reduce((total, item) => total + item.count, 0)}`, "", "var teacherCoursePracticums = []struct {", "\tID string", "\tTitle string", "\tTotal int", "}{", ...includedPracticums.map((item) => `\t{ID: ${JSON.stringify(item.id)}, Title: ${JSON.stringify(item.title)}, Total: ${item.count}},`), "}", ""].join("\n"));
}

function writeFrontendCatalog() {
  const lessonsCatalog = includedLessons.map((item) => ({ id: item.id, sectionId: item.sectionId, title: item.title, slug: item.slug, skillIds: item.skillIds, exerciseOrder: lessonExercises(item).map((exercise) => exercise.id), exerciseTitles: lessonExercises(item).map((exercise, index) => ({ id: exercise.id, title: exercise.title, path: `sections/${item.sectionId}/${item.slug}/exercises/${index === 2 ? "checkpoint.json" : `${String(index + 1).padStart(2, "0")}-guided.json`}` })) }));
  const practicumCatalog = includedPracticums.map((item) => { const exercises = practicumExercises(item); return { id: item.id, title: item.title, slug: item.slug, skillIds: [...new Set(includedLessons.filter((lesson) => batches.indexOf(lesson.batch) <= batches.indexOf(item.batch)).flatMap((lesson) => lesson.skillIds))], exerciseOrder: exercises.map((exercise) => exercise.id), exerciseTitles: exercises.map((exercise, index) => ({ id: exercise.id, title: exercise.title, path: `practicums/${item.slug}/exercises/${String(index + 1).padStart(2, "0")}.json` })) }; });
  writeFileSync(join(contentRoot, "frontend-manifest.json"), json({ lessons: lessonsCatalog, practicums: practicumCatalog }));
}

if (reset) for (const path of [join(contentRoot, "sections"), join(contentRoot, "practicums")]) if (existsSync(path) && statSync(path).isDirectory()) rmSync(path, { recursive: true });
ensureDirectory(contentRoot);
for (const item of includedLessons) writeLesson(item, !theoryOnly);
const course = buildCourse();
const manifest = sourceManifest();
writeFileSync(join(contentRoot, "source-manifest.json"), json(manifest));
writeReports(manifest, course);
if (!theoryOnly) {
  for (const practicum of includedPracticums) writePracticum(practicum);
  writeFileSync(join(contentRoot, "course.json"), json(course));
  writeBackendCatalog();
  writeFrontendCatalog();
}
console.log(`Imported ${theoryOnly ? "theory for " : ""}batches A–${through}: ${includedLessons.length} lessons, ${theoryOnly ? "practice unchanged" : `${includedPracticums.length} practicums`}.`);
