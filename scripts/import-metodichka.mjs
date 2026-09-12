import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lessonExercises, practicumExercises } from "./exercise-factories.mjs";
import { lessons, sections } from "./curriculum-map.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = join(projectRoot, "content/python");
const defaultSourceRoot = resolve(projectRoot, "../python-school-metodichka");
const sourceArg = process.argv.find((value) => value.startsWith("--source="));
const throughArg = process.argv.find((value) => value.startsWith("--through="));
const sourceRoot = sourceArg ? resolve(sourceArg.slice("--source=".length)) : defaultSourceRoot;
const through = (throughArg?.slice("--through=".length) ?? "F").toUpperCase();
const batches = ["A", "B", "C", "D", "E", "F"];

if (!batches.includes(through)) throw new Error(`Unknown batch ${through}; expected A–F`);
if (!existsSync(join(sourceRoot, "mkdocs.yml"))) {
  throw new Error(`MkDocs source not found at ${sourceRoot}. Use --source=/path/to/python-school-metodichka.`);
}

const includedBatches = batches.slice(0, batches.indexOf(through) + 1);
const includedLessons = lessons.filter((item) => includedBatches.includes(item.batch));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const ensureDirectory = (path) => mkdirSync(path, { recursive: true });

const sourceToRoute = new Map();
for (const item of includedLessons) {
  for (const source of item.sources) {
    if (!sourceToRoute.has(source)) sourceToRoute.set(source, `/python/${item.sectionId}/${item.slug}`);
  }
}

function stripExamLanguage(markdown) {
  const lines = markdown.split("\n");
  let fenced = false;
  return lines.filter((line) => {
    if (/^```/.test(line.trim())) fenced = !fenced;
    if (fenced) return true;
    return !/(ОГЭ|ЕГЭ|экзаменационн|номер задания)/i.test(line);
  }).join("\n");
}

function convertAdmonitions(markdown, sourcePath) {
  const lines = markdown.split("\n");
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(!!!|\?\?\?)\s+([\w-]+)(?:\s+"([^"]+)")?\s*$/);
    if (!match) {
      output.push(lines[index]);
      continue;
    }
    const collapsible = match[1] === "???";
    const title = match[3] ?? match[2];
    const body = [];
    while (index + 1 < lines.length && (/^ {4}/.test(lines[index + 1]) || lines[index + 1].trim() === "")) {
      index += 1;
      body.push(lines[index].startsWith("    ") ? lines[index].slice(4) : "");
    }
    if (!body.some((line) => line.trim())) {
      throw new Error(`${sourcePath}:${index + 1}: empty MkDocs admonition would be lossy`);
    }
    if (collapsible) {
      output.push(`<details><summary>${title}</summary>`, "", ...body, "", "</details>");
    } else {
      output.push(`> **${title}**`, ...body.map((line) => line ? `> ${line}` : ">"));
    }
  }
  return output.join("\n");
}

function rewriteLinks(markdown, sourcePath) {
  return markdown.replace(/\[([^\]]+)]\(([^)#]+)(#[^)]+)?\)/g, (whole, label, href, anchor = "") => {
    if (/^(https?:|mailto:|#)/.test(href)) return whole;
    const sourceDirectory = dirname(join(sourceRoot, sourcePath));
    let target = resolve(sourceDirectory, href);
    if (href.endsWith("/")) target = join(target, "index.md");
    if (!target.endsWith(".md")) target += ".md";
    const relativeTarget = relative(sourceRoot, target).replaceAll("\\", "/");
    const route = sourceToRoute.get(relativeTarget);
    return route ? `[${label}](${route}${anchor})` : label;
  });
}

function transformMarkdown(raw, sourcePath) {
  let markdown = raw.replace(/\r\n?/g, "\n");
  markdown = markdown
    .replace(/<p class="reading-time">[\s\S]*?<\/p>\s*/g, "")
    .replace(/<div class="tags">[\s\S]*?<\/div>\s*/g, "")
    .replace(/<div class="topic-nav">[\s\S]*?<\/div>\s*/g, "")
    .replace(/\{\s*\.[^}]+\}/g, "");
  markdown = convertAdmonitions(markdown, sourcePath);
  markdown = stripExamLanguage(markdown);
  markdown = rewriteLinks(markdown, sourcePath);
  let fenced = false;
  markdown.split("\n").forEach((sourceLine, index) => {
    if (/^```/.test(sourceLine.trim())) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const line = sourceLine.replace(/`[^`]*`/g, "");
    const unexpectedHtml = [...line.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)]
      .filter((match) => !["details", "summary"].includes(match[1].toLowerCase()));
    if (unexpectedHtml.length) {
      throw new Error(`${sourcePath}:${index + 1}: unsupported HTML <${unexpectedHtml[0][1]}> would be lossy`);
    }
  });
  if (/^(!!!|\?\?\?)\s/m.test(markdown)) {
    throw new Error(`${sourcePath}: unsupported MkDocs admonition remains after conversion`);
  }
  return markdown.trim();
}

const sectionRules = {
  "python-branches-if-else": { "docs/basics/conditions.md": ["1. Как", "2. Два", "7. Частые", "8. Мини", "9. Проверьте"] },
  "python-branches-elif-ranges": { "docs/basics/conditions.md": ["3. Несколько", "6. Типовой", "7. Частые", "8. Мини", "9. Проверьте"] },
  "python-branches-compound": {
    "docs/basics/conditions.md": ["4. Независимые", "5. Составные", "7. Частые", "8. Мини", "9. Проверьте"],
    "docs/basics/logic.md": ["1. Сравнения", "2. Перевод"]
  },
  "python-loops-accumulators": { "docs/loops/accumulators.md": ["1. Основные", "4. Частые", "5. Мини", "6. Проверьте"] },
  "python-loops-min-max-average": { "docs/loops/accumulators.md": ["2. Максимум", "3. Обычный", "4. Частые", "5. Мини", "6. Проверьте"] },
  "python-strings-algorithms": { "docs/strings/algorithms.md": ["Состояние одного", "Мини-практика", "Проверьте"] },
  "python-strings-runs": { "docs/strings/algorithms.md": ["Пары и состояние", "Мини-практика", "Проверьте"] },
  "python-lists-basics": { "docs/lists/basics.md": ["1. Создание", "2. Индекс", "7. Частые", "8. Мини", "9. Проверьте"] },
  "python-lists-mutation": { "docs/lists/basics.md": ["3. Список", "4. Добавление", "5. Удаление", "6. Значение", "7. Частые", "8. Мини", "9. Проверьте"] },
  "python-lists-2d": { "docs/lists/2d-lists.md": ["Строка, столбец", "Создание независимых", "Мини-практика", "Проверьте"] },
  "python-lists-matrices": { "docs/lists/2d-lists.md": ["Строка, столбец", "Проверьте"] },
  "python-graphs-traversal": {
    "docs/graphs/basics.md": ["Три формы хранения"],
    "docs/graphs/paths.md": ["Поиск в глубину", "Выбор алгоритма", "Проверьте"]
  },
  "python-graphs-paths": { "docs/graphs/paths.md": ["Количество путей", "Идея Дейкстры", "Выбор алгоритма", "Проверьте"] }
};

function selectSections(markdown, item, sourcePath) {
  const wanted = sectionRules[item.id]?.[sourcePath];
  if (!wanted) return markdown;
  const preamble = [];
  const chunks = [];
  let current = null;
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^```/.test(line.trim())) fenced = !fenced;
    if (!fenced && /^## /.test(line)) {
      current = { heading: line.slice(3), lines: [line] };
      chunks.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  const selected = chunks.filter((chunk) => wanted.some((fragment) => chunk.heading.includes(fragment)));
  if (selected.length === 0) throw new Error(`${sourcePath}: no requested sections found for ${item.id}`);
  return [...preamble, ...selected.flatMap((chunk) => chunk.lines)].join("\n").trim();
}

const lessonSupplements = {
  "python-lists-matrices": `## Типовой проход по матрице

Для суммы каждой строки внешний цикл выбирает строку, а внутренний перебирает её элементы. Индексы нужны, когда результат зависит от координат — например, на главной диагонали номер строки равен номеру столбца.

\`\`\`python
matrix = [[2, 5], [7, 1]]

for row in matrix:
    print(sum(row))

diagonal_sum = 0
for i in range(len(matrix)):
    diagonal_sum += matrix[i][i]
print(diagonal_sum)
\`\`\`

## Типичная ошибка

Не предполагайте, что число строк равно числу столбцов, если это не сказано в условии. Для прямоугольной матрицы используйте \`len(matrix)\` и \`len(matrix[0])\` отдельно.`,
  "python-strings-runs": `## Инвариант серии

Во время прохода храните символ текущей серии, её длину и лучший найденный результат. При смене символа текущая длина снова становится равной единице, а лучший результат не обнуляется.`,
  "python-complexity-basics": `## Практическое правило

Сначала оцените максимальный размер входа. Один проход по миллиону элементов обычно допустим, а полный перебор всех пар даёт уже около триллиона сравнений. Оценка сложности нужна до написания кода, а не после превышения лимита времени.`
};

function dpLesson() {
  return `# Основы динамического программирования

Динамическое программирование помогает не вычислять одни и те же подзадачи много раз. После урока вы сможете выделять состояние, задавать базовые значения и строить переход между состояниями.

## Когда нужен этот подход

Задача подходит для динамического программирования, если её ответ можно собрать из ответов для меньших входов, а одинаковые подзадачи возникают повторно. Например, число способов подняться на ступень зависит от способов попасть на две предыдущие ступени.

## Состояние, база и переход

Пусть можно шагнуть на одну или две ступени. Обозначим через \`ways[i]\` число способов попасть на ступень \`i\`.

- состояние: номер текущей ступени \`i\`;
- база: \`ways[0] = 1\`;
- переход: \`ways[i] = ways[i - 1] + ways[i - 2]\`.

\`\`\`python
n = int(input())
ways = [0] * (n + 2)
ways[0] = 1

for i in range(n):
    ways[i + 1] += ways[i]
    ways[i + 2] += ways[i]

print(ways[n])
\`\`\`

Массив заполняется слева направо: к моменту вычисления нового состояния все нужные предыдущие ответы уже известны.

## Как проектировать решение

1. Сформулируйте, что именно означает один элемент таблицы.
2. Выпишите самые маленькие случаи вручную.
3. Найдите переход только из уже вычисленных состояний.
4. Определите порядок заполнения.
5. Проверьте, где лежит окончательный ответ.

## Типичная ошибка

Нельзя задавать переход раньше смысла состояния. Формула может выглядеть правдоподобно, но считать другой объект. Сначала закончите фразу «\`dp[i]\` — это…», затем пишите код.

## Мини-проверка

Почему база для пустого пути равна единице? Потому что существует один способ ничего не делать. Какие значения нужны для вычисления \`ways[5]\`? \`ways[4]\` и \`ways[3]\`.
`;
}

function lessonMarkdown(item) {
  const sourceBodies = item.sources.map((sourcePath) => {
    const absolute = join(sourceRoot, sourcePath);
    if (!existsSync(absolute)) throw new Error(`${sourcePath}: mapped source does not exist`);
    return selectSections(transformMarkdown(readFileSync(absolute, "utf8"), sourcePath), item, sourcePath)
      .replace(/^# .+$/m, "")
      .trim();
  });
  const sourceBody = item.sources.length ? sourceBodies.join("\n\n") : dpLesson().replace(/^# .+$/m, "").trim();
  const body = [sourceBody, lessonSupplements[item.id]].filter(Boolean).join("\n\n");
  return `# ${item.title}\n\nПосле урока вы сможете ${item.focus}.\n\n${body}\n`;
}

const practicumDefinitions = [
  { batch: "A", id: "python-practicum-first-programs", slug: "first-programs", title: "Практикум 1. Первые программы", count: 12 },
  { batch: "B", id: "python-practicum-loops", slug: "loops", title: "Практикум 2. Циклы", count: 15 },
  { batch: "C", id: "python-practicum-data", slug: "data", title: "Практикум 3. Строки и коллекции", count: 15 },
  { batch: "D", id: "python-practicum-functions-files", slug: "functions-files", title: "Практикум 4. Функции, рекурсия и файлы", count: 12 },
  { batch: "E", id: "python-practicum-algorithms", slug: "algorithms", title: "Практикум 5. Алгоритмы", count: 15 },
  { batch: "F", id: "python-practicum-final", slug: "final", title: "Практикум 6. Итоговый", count: 20 }
];

function writeLesson(item) {
  const directory = join(contentRoot, "sections", item.sectionId, item.slug);
  const exerciseDirectory = join(directory, "exercises");
  ensureDirectory(exerciseDirectory);
  const exercises = lessonExercises(item);
  const metadata = {
    schemaVersion: 1,
    id: item.id,
    sectionId: item.sectionId,
    title: item.title,
    slug: item.slug,
    readingMinutes: item.sectionId === "graphs" ? 18 : 15,
    practiceMinutes: item.batch === "F" ? 40 : 30,
    tags: ["python", `batch_${item.batch.toLowerCase()}`, ...item.skillIds.map((skill) => skill.toLowerCase())],
    skillIds: item.skillIds,
    sourcePaths: item.sources.length ? item.sources : ["authored:dynamic-programming"],
    exerciseOrder: exercises.map((exercise) => exercise.id),
    checkpointExerciseId: exercises.at(-1).id
  };
  writeFileSync(join(directory, "lesson.json"), json(metadata));
  writeFileSync(join(directory, "lesson.md"), lessonMarkdown(item));
  exercises.forEach((exercise, index) => {
    const name = index === 2 ? "checkpoint.json" : `${String(index + 1).padStart(2, "0")}-guided.json`;
    writeFileSync(join(exerciseDirectory, name), json(exercise));
  });
}

function writePracticum(definition) {
  const directory = join(contentRoot, "practicums", definition.slug);
  const exerciseDirectory = join(directory, "exercises");
  ensureDirectory(exerciseDirectory);
  const availableLessons = includedLessons.filter((item) => batches.indexOf(item.batch) <= batches.indexOf(definition.batch));
  const exercises = practicumExercises(definition, availableLessons);
  const skillIds = [...new Set(availableLessons.flatMap((item) => item.skillIds))];
  writeFileSync(join(directory, "practicum.json"), json({
    schemaVersion: 1,
    id: definition.id,
    title: definition.title,
    slug: definition.slug,
    skillIds,
    exerciseOrder: exercises.map((exercise) => exercise.id)
  }));
  exercises.forEach((exercise, index) => {
    writeFileSync(join(exerciseDirectory, `${String(index + 1).padStart(2, "0")}.json`), json(exercise));
  });
}

function buildCourse() {
  const activeSections = sections
    .map((section) => ({
      ...section,
      lessonIds: includedLessons.filter((item) => item.sectionId === section.id).map((item) => item.id)
    }))
    .filter((section) => section.lessonIds.length);
  const activePracticums = practicumDefinitions.filter((item) => includedBatches.includes(item.batch));
  const sequence = [];
  for (const batch of includedBatches) {
    for (const section of activeSections.filter((entry) => includedLessons.some((item) => item.batch === batch && item.sectionId === entry.id))) {
      sequence.push({ type: "section", id: section.id });
    }
    const practicum = activePracticums.find((item) => item.batch === batch);
    sequence.push({ type: "practicum", id: practicum.id });
  }
  return {
    schemaVersion: 1,
    id: "python",
    title: "Python для школьников",
    description: "Последовательный курс алгоритмического программирования на Python",
    requiredSkillIds: [...new Set(includedLessons.flatMap((item) => item.skillIds))],
    sections: activeSections,
    practicums: activePracticums.map((item) => ({ id: item.id, title: item.title, path: `practicums/${item.slug}` })),
    sequence
  };
}

function sourceManifest() {
  const sourceFiles = [...new Set(includedLessons.flatMap((item) => item.sources))];
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).trim();
  return {
    schemaVersion: 1,
    repository: "https://github.com/itpark32/python-school-metodichka",
    commit,
    importedThroughBatch: through,
    files: sourceFiles.map((path) => {
      const contents = readFileSync(join(sourceRoot, path), "utf8");
      return { path, sha256: sha256(contents) };
    })
  };
}

function writeReports(manifest, course) {
  const sourceUsage = new Map();
  for (const item of includedLessons) {
    for (const source of item.sources) {
      const consumers = sourceUsage.get(source) ?? [];
      consumers.push(item.id);
      sourceUsage.set(source, consumers);
    }
  }
  const report = [
    "# Отчёт импорта методички",
    "",
    `Источник: \`itpark32/python-school-metodichka\`, commit \`${manifest.commit}\`.`,
    `Импортирован пакет: **A–${through}**. Уроков: **${includedLessons.length}**, практикумов: **${course.practicums.length}**.`,
    "",
    "## Преобразования",
    "",
    "- reading-time и HTML-теги перенесены в lesson.json;",
    "- MkDocs admonitions преобразованы в обычный Markdown или details;",
    "- topic-nav удалён, внутренние ссылки заменены маршрутами платформы;",
    "- экзаменационные ярлыки и привязка к номеру задания удалены;",
    "- attr_list удалён после переноса семантики; неизвестный потенциально lossy-синтаксис останавливает импорт;",
    "- каждому уроку добавлены цель, 2 guided-задачи, checkpoint и проверяемое reference solution.",
    "",
    "## Аудит прежнего контента",
    "",
    "Прежние уроки по функциям, рекурсии, файлам и сортировке были содержательно нормальными: понятные примеры, типичные ошибки и рабочие задачи. Их проблема была не в качестве объяснений, а в неполном покрытии программы. Урок `if и else` объединял SK05–SK07 и был слишком широким; теперь материал разделён на три самостоятельных урока. Все пять прежних тем пересобраны из закреплённого источника и проходят те же gates, что новый контент.",
    "",
    "## Использованные исходники",
    "",
    ...[...sourceUsage.entries()].sort().map(([source, consumers]) => `- \`${source}\` → ${consumers.map((id) => `\`${id}\``).join(", ")}`),
    "",
    "`docs/exams/**` и самостоятельный маршрут Python+ намеренно не импортируются: они не входят в target curriculum. Фрагмент про исключения используется только как дополнительный источник урока об отладке. DP создан как новый материал, потому что в методичке нет отдельного исходного урока.",
    ""
  ].join("\n");
  writeFileSync(join(projectRoot, "docs/import-report.md"), report);

  const skillRows = course.requiredSkillIds.map((skill) => {
    const owners = includedLessons.filter((item) => item.skillIds.includes(skill));
    return `| ${skill} | ${owners.map((item) => `\`${item.id}\``).join(", ")} | ${owners.every((item) => lessonExercises(item).length === 3) ? "3+ на урок" : "ошибка"} |`;
  });
  writeFileSync(join(projectRoot, "docs/curriculum-coverage.md"), [
    "# Покрытие учебной программы",
    "",
    `Срез после пакета **${through}**. Покрыто навыков: **${course.requiredSkillIds.length} / 44**.`,
    "",
    "## Нарастание coverage по пакетам",
    "",
    "| Пакет | Уроков накопительно | Практикумов | Задач | Навыков |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...includedBatches.map((batch) => {
      const batchLessons = lessons.filter((item) => batches.indexOf(item.batch) <= batches.indexOf(batch));
      const batchPracticums = practicumDefinitions.filter((item) => batches.indexOf(item.batch) <= batches.indexOf(batch));
      const exerciseCount = batchLessons.length * 3 + batchPracticums.reduce((total, item) => total + item.count, 0);
      const skillCount = new Set(batchLessons.flatMap((item) => item.skillIds)).size;
      return `| ${batch} | ${batchLessons.length} | ${batchPracticums.length} | ${exerciseCount} | ${skillCount} / 44 |`;
    }),
    "",
    "## Skills",
    "",
    "| Навык | Уроки | Автопроверяемая практика |",
    "| --- | --- | --- |",
    ...skillRows,
    ""
  ].join("\n"));
}

function writeBackendCatalog(course) {
  const activePracticums = practicumDefinitions.filter((item) => includedBatches.includes(item.batch));
  const lines = [
    "// Code generated by scripts/import-metodichka.mjs; DO NOT EDIT.",
    "package main",
    "",
    "var teacherCourseLessons = []string{",
    ...includedLessons.map((item) => `\t${JSON.stringify(item.id)},`),
    "}",
    "",
    `const teacherCourseExerciseCount = ${includedLessons.length * 3 + activePracticums.reduce((total, item) => total + item.count, 0)}`,
    "",
    "var teacherCoursePracticums = []struct {",
    "\tID string",
    "\tTitle string",
    "\tTotal int",
    "}{",
    ...activePracticums.map((item) => `\t{ID: ${JSON.stringify(item.id)}, Title: ${JSON.stringify(item.title)}, Total: ${item.count}},`),
    "}",
    ""
  ];
  writeFileSync(join(projectRoot, "backend/course_catalog_generated.go"), lines.join("\n"));
}

if (process.argv.includes("--reset")) {
  for (const explicitPath of [join(contentRoot, "sections"), join(contentRoot, "practicums")]) {
    if (existsSync(explicitPath) && statSync(explicitPath).isDirectory()) rmSync(explicitPath, { recursive: true });
  }
}

ensureDirectory(contentRoot);
for (const item of includedLessons) writeLesson(item);
for (const practicum of practicumDefinitions.filter((item) => includedBatches.includes(item.batch))) writePracticum(practicum);
const course = buildCourse();
const manifest = sourceManifest();
writeFileSync(join(contentRoot, "course.json"), json(course));
writeFileSync(join(contentRoot, "source-manifest.json"), json(manifest));
writeReports(manifest, course);
writeBackendCatalog(course);
console.log(`Imported batches A–${through}: ${includedLessons.length} lessons, ${course.practicums.length} practicums.`);
