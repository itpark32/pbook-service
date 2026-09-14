import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lessons } from "./curriculum-map.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const boundaries = {
  stack_queue: "без deque как готового решения, без DFS/BFS и графов",
  graph: "без обходов, расстояний и путей",
  graph_paths: "только BFS, расстояния, parent и невзвешенные рёбра; без heapq, Дейкстры и DAG-подсчёта",
  dijkstra: "только неотрицательные веса; без отрицательных рёбер и других алгоритмов кратчайших путей",
  debug: "без try/except, бесконечных циклов, continue и файлов",
  binary: "без bisect и готовой сортировки",
  simple_sort: "без sorted и .sort()",
  dict: "без Counter",
  dp: "без графовых переходов и оптимизаций",
  default: "без конструкций следующих разделов"
};
const rows = lessons.map((lesson) => {
  const upstream = lesson.sources.length ? lesson.sources.map((path) => `\`${path}\``).join("<br>") : "локальная авторская тема";
  const local = `\`content-source/python/sections/${lesson.sectionId}/${lesson.slug}.md\``;
  const keep = lesson.sources.length ? "термины и учебные примеры методички" : "идею состояния, базы и перехода";
  const add = lesson.id === "python-collections-stack-queue" ? "LIFO/FIFO, список+head, проверка скобок" : lesson.id === "python-graphs-dijkstra" ? "релаксация, heapq, устаревшие записи, parent" : `цель, фокус, 2 примера, разбор и checkpoint-переход`;
  const prerequisite = lesson.id === "python-graphs-dijkstra" ? "списки смежности, BFS, parent" : lesson.id === "python-collections-stack-queue" ? "списки, append, индексы" : "материал предыдущих уроков";
  const remove = lesson.id === "python-graphs-paths" ? "взвешенные пути и число путей DAG" : "экзаменационные ярлыки, MkDocs-разметку и лишние будущие темы";
  return `| \`${lesson.id}\` | ${lesson.skillIds.join(", ")} — ${lesson.focus} | ${upstream} | ${local} | ${keep} | ${remove} | ${add} | ${prerequisite} | ${boundaries[lesson.family] ?? boundaries.default} |`;
});
const document = [
  "# Карта переработки содержания уроков", "",
  "Финальный текст уроков хранится локально: импортёр переносит его без нарезки upstream Markdown. Методичка остаётся источником происхождения тем и ориентиром для аудита.", "",
  "| Урок / роль | Upstream-контекст | Локальный источник | Сохраняем | Убираем | Добавляем | Предпосылки | Граница урока |", "| --- | --- | --- | --- | --- | --- | --- | --- |", ...rows, "",
  "## Контрольные решения", "",
  "- 49 локальных статей имеют ровно один H1, outcome, Focus и 2–4 проверяемых Python-примера.",
  "- `python-graphs-paths` не упоминает Дейкстру, `heapq` или взвешенные рёбра; эти понятия начинаются в отдельном уроке SK46.",
  "- `python-collections-stack-queue` не использует графы; `deque` указан только как последующее расширение после явной реализации очереди.",
  "- `make import-theory` не трогает задания и практикумы; source-manifest фиксирует hash каждого локального источника.", ""
].join("\n");
writeFileSync(join(root, "docs/lesson-content-redesign-map.md"), document);
console.log("Wrote docs/lesson-content-redesign-map.md");
