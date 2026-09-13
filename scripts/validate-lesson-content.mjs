import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lessons } from "./curriculum-map.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "content-source/python/sections");
const generatedRoot = join(root, "content/python/sections");
const errors = [];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sourceFor = (lesson) => join(sourceRoot, lesson.sectionId, `${lesson.slug}.md`);
const generatedFor = (lesson) => join(generatedRoot, lesson.sectionId, lesson.slug, "lesson.md");
const paragraphHashes = new Map();
let previousParagraphs = new Set();

function paragraphs(text) {
  return text.replace(/```[\s\S]*?```/g, "").split(/\n\s*\n/).map((part) => part.replace(/\s+/g, " ").trim()).filter((part) => part.length >= 120 && !part.startsWith("#") && !part.startsWith(">"));
}

for (const lesson of lessons) {
  const source = sourceFor(lesson);
  const generated = generatedFor(lesson);
  const label = `${lesson.id}`;
  if (!existsSync(source)) { errors.push(`${label}: missing authored source`); continue; }
  if (!existsSync(generated)) { errors.push(`${label}: missing generated lesson`); continue; }
  const text = readFileSync(source, "utf8").replace(/\r\n?/g, "\n").trimEnd() + "\n";
  const rendered = readFileSync(generated, "utf8").replace(/\r\n?/g, "\n").trimEnd() + "\n";
  if (text !== rendered) errors.push(`${label}: generated lesson differs from local source`);
  const h1 = [...text.matchAll(/^# (.+)$/gm)];
  if (h1.length !== 1 || h1[0][1].trim() !== lesson.title) errors.push(`${label}: needs one matching H1`);
  if (!text.includes("После урока вы сможете")) errors.push(`${label}: missing learning outcome`);
  if (!/> \*\*Фокус\*\*/.test(text)) errors.push(`${label}: missing Focus block`);
  const headings = [...text.matchAll(/^#{2,} (.+)$/gm)].map((match) => match[1].trim());
  if (headings.some((heading) => !heading) || new Set(headings).size !== headings.length) errors.push(`${label}: duplicate or empty heading`);
  if (/^(!!!|\?\?\?)\s|\{\.[^}]+\}/m.test(text)) errors.push(`${label}: MkDocs-only syntax remains`);
  const fences = [...text.matchAll(/```python\n([\s\S]*?)```/g)];
  if (fences.length < 2 || fences.length > 4) errors.push(`${label}: expected 2–4 Python examples`);
  for (const [index, fence] of fences.entries()) {
    const result = spawnSync("python3", ["-c", "import sys; compile(sys.stdin.read(), '<lesson>', 'exec')"], { input: fence[1], encoding: "utf8" });
    if (result.status !== 0 && !text.includes(`<!-- pbook-intentional-error:${index + 1} -->`)) errors.push(`${label}: Python example ${index + 1} has invalid syntax`);
  }
  const disallow = [];
  if (lesson.id === "python-debugging-basics") disallow.push("try", "except", "while True", "continue", "open(");
  if (["python-basics-input-output", "python-basics-types-arithmetic", "python-basics-div-mod-digits", "python-basics-logic", "python-branches-if-else", "python-branches-elif-ranges", "python-branches-compound"].includes(lesson.id)) disallow.push("for ", "while ");
  if (lesson.id === "python-algorithms-selection-sort") disallow.push("sorted(", ".sort(");
  if (lesson.id === "python-algorithms-binary-search") disallow.push("bisect");
  if (lesson.id === "python-collections-dicts-frequency") disallow.push("Counter");
  const codeText = fences.map((fence) => fence[1]).join("\n");
  for (const token of disallow) if (codeText.includes(token)) errors.push(`${label}: forbidden future construct ${token}`);
  const current = new Set();
  for (const paragraph of paragraphs(text)) {
    const digest = hash(paragraph);
    if (paragraphHashes.has(digest)) errors.push(`${label}: repeats a long paragraph from ${paragraphHashes.get(digest)}`);
    if (previousParagraphs.has(digest)) errors.push(`${label}: repeats a long paragraph from preceding lesson`);
    paragraphHashes.set(digest, label);
    current.add(digest);
  }
  previousParagraphs = current;
}

const sourceCount = lessons.reduce((count, lesson) => count + Number(existsSync(sourceFor(lesson))), 0);
if (sourceCount !== 49) errors.push(`expected 49 authored sources, got ${sourceCount}`);
if (errors.length) throw new Error(`Lesson-content validation failed:\n- ${errors.join("\n- ")}`);
console.log("Lesson content valid: 49 authored sources, generated theory matches, boundaries checked.");
