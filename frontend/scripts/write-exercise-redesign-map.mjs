import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lessons, practicums } from "./curriculum-map.mjs";
import { lessonProfiles, practicumProfiles } from "./exercise-factories.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
const lines = [
  "# Карта переработки упражнений",
  "",
  "Источник правды для задач — `scripts/exercise-factories.mjs`. Эта карта фиксирует педагогическое назначение каждого задания и делает ручной аудит импорта воспроизводимым.",
  "",
  "## Уроки",
  "",
  "| Урок | Новый навык | Guided 1 | Guided 2 | Checkpoint | Почему без забегания вперёд |",
  "| --- | --- | --- | --- | --- | --- |"
];

for (const lesson of lessons) {
  const tasks = lessonProfiles[lesson.id];
  lines.push(`| \`${lesson.id}\` | ${lesson.skillIds.join(", ")} — ${lesson.focus} | ${tasks[0].title} | ${tasks[1].title} | ${tasks[2].title} | Используются только приёмы текущего урока и уже пройденных разделов; будущие конструкции не требуются. |`);
}

lines.push("", "## Практикумы", "");
for (const practicum of practicums) {
  lines.push(`### ${practicum.title}`, "", "| № | Идея | Основные навыки | Сложность | Почему здесь |", "| ---: | --- | --- | --- | --- |");
  for (const [index, task] of practicumProfiles[practicum.id].entries()) {
    const source = lessonById.get(task.lessonId);
    lines.push(`| ${index + 1} | ${task.idea} | ${task.skills.join(", ")} | ${task.difficulty} | Взято вручную из \`${task.lessonId}\` (${source.title}); навык уже доступен к пакету ${practicum.batch}. |`);
  }
  lines.push("");
}

lines.push("## Правила банка", "", "- У каждого урока ровно три задания: два guided и checkpoint.", "- У каждого задания есть не менее трёх прогонов reference solution и не менее двух предметных подсказок.", "- Практикумы не выбирают задания из общего пула: порядок, сложность и смысл каждого пункта заданы явно.", "- Запреты на `max`, `sorted`, `.sort()` и рекурсию применяются только там, где их поддерживает структурная проверка рантайма.", "");
writeFileSync(resolve(root, "docs/exercise-redesign-map.md"), `${lines.join("\n")}\n`);
console.log("Wrote docs/exercise-redesign-map.md");
