import courseData from "../../content/python/course.json";
import frontendManifestData from "../../content/python/frontend-manifest.json";
import type { Exercise, Lesson } from "./types";

export type LessonContent = {
  path: string;
  sectionTitle: string;
  lesson: Lesson;
  exercises: Exercise[];
  markdown: string;
  isPracticum?: boolean;
};

type Course = {
  sections: { id: string; title: string; description: string; outcome: string; lessonIds: string[] }[];
  practicums: { id: string; title: string; path: string }[];
  sequence: { type: "section" | "practicum"; id: string }[];
};

type Practicum = {
  id: string;
  title: string;
  slug: string;
  skillIds: string[];
  exerciseOrder: string[];
};

type ManifestLesson = Omit<Lesson, "checkpointExerciseId"> & {
  exerciseTitles: { id: string; title: string; path: string }[];
};
type ManifestPracticum = Practicum & { exerciseTitles: { id: string; title: string; path: string }[] };
type FrontendManifest = { lessons: ManifestLesson[]; practicums: ManifestPracticum[] };
export type CourseEntry = {
  path: string;
  sectionTitle: string;
  lesson: Lesson;
  isPracticum?: boolean;
};

const lessonModules = import.meta.glob("../../content/python/sections/**/lesson.json", {
  eager: true,
  import: "default"
}) as Record<string, Lesson>;
const practicumModules = import.meta.glob("../../content/python/practicums/**/practicum.json", {
  eager: true,
  import: "default"
}) as Record<string, Practicum>;
const exerciseModules = import.meta.glob("../../content/python/**/exercises/*.json", {
  import: "default"
}) as Record<string, () => Promise<Exercise>>;
const markdownModules = import.meta.glob("../../content/python/sections/**/lesson.md", {
  as: "raw"
}) as Record<string, () => Promise<string>>;
const practicumMarkdownModules = import.meta.glob("../../content/python/practicums/**/practicum.md", {
  as: "raw"
}) as Record<string, () => Promise<string>>;
const fixtureModules = import.meta.glob("../../content/python/fixtures/**/*", {
  as: "raw"
}) as Record<string, () => Promise<string>>;

const course = courseData as Course;
const frontendManifest = frontendManifestData as FrontendManifest;
const lessonById = new Map(Object.values(lessonModules).map((lesson) => [lesson.id, lesson]));
const practicumById = new Map(Object.values(practicumModules).map((practicum) => [practicum.id, practicum]));
export const exerciseTitleById = new Map(
  [...frontendManifest.lessons, ...frontendManifest.practicums].flatMap((item) => item.exerciseTitles)
    .map((item) => [item.id, item.title])
);

async function resolveFixtures(exercise: Exercise): Promise<Exercise> {
  if (exercise.judge.type !== "files") return exercise;
  const resolveFile = async (file: { path: string; content?: string; fixture?: string }) => {
    if (typeof file.content === "string") return { path: file.path, content: file.content };
    const loader = file.fixture
      ? Object.entries(fixtureModules).find(([path]) => path.endsWith(`/content/python/${file.fixture}`))?.[1]
      : undefined;
    const content = loader ? await loader() : undefined;
    if (typeof content !== "string") throw new Error(`Не найден fixture ${file.fixture ?? file.path}`);
    return { path: file.path, content };
  };
  return {
    ...exercise,
    fileExamples: exercise.fileExamples
      ? await Promise.all(exercise.fileExamples.map(async (example) => ({
        ...example,
        files: await Promise.all(example.files.map(resolveFile))
      })))
      : undefined,
    judge: {
      ...exercise.judge,
      tests: await Promise.all(exercise.judge.tests.map(async (test) => ({
        ...test,
        inputFiles: await Promise.all(test.inputFiles.map(resolveFile)),
        expectedFiles: test.expectedFiles ? await Promise.all(test.expectedFiles.map(resolveFile)) : undefined
      })))
    }
  };
}

const exerciseEntryById = new Map(
  [...frontendManifest.lessons, ...frontendManifest.practicums]
    .flatMap((item) => item.exerciseTitles)
    .map((item) => [item.id, item])
);
const exercisesFor = async (ids: string[]) => Promise.all(ids.map(async (id) => {
  const entry = exerciseEntryById.get(id);
  const loader = entry
    ? Object.entries(exerciseModules).find(([path]) => path.endsWith(`/content/python/${entry.path}`))?.[1]
    : undefined;
  const exercise = loader ? await loader() : undefined;
  if (!exercise) throw new Error(`Не найдено упражнение ${id}`);
  return resolveFixtures(exercise);
}));

const entries: CourseEntry[] = [];
for (const sequenceItem of course.sequence) {
  if (sequenceItem.type === "section") {
    const section = course.sections.find((item) => item.id === sequenceItem.id);
    if (!section) continue;
    for (const lessonId of section.lessonIds) {
      const lesson = lessonById.get(lessonId);
      if (!lesson) throw new Error(`Не найден урок ${lessonId}`);
      entries.push({
        path: `/python/${lesson.sectionId}/${lesson.slug}`,
        sectionTitle: section.title,
        lesson
      });
    }
    continue;
  }
  const practicumEntry = course.practicums.find((item) => item.id === sequenceItem.id);
  const practicum = practicumById.get(sequenceItem.id);
  if (!practicumEntry || !practicum) continue;
  const lesson: Lesson = {
    id: practicum.id,
    sectionId: "practicums",
    title: practicum.title,
    slug: practicum.slug,
    skillIds: practicum.skillIds,
    exerciseOrder: practicum.exerciseOrder,
    checkpointExerciseId: practicum.exerciseOrder.at(-1) ?? ""
  };
  entries.push({
    path: `/python/practicums/${practicum.slug}`,
    sectionTitle: "Практикумы",
    lesson,
    isPracticum: true
  });
}

export const courseEntries = entries;
export const courseEntryByPath = new Map(courseEntries.map((entry) => [entry.path, entry]));

export async function loadLessonContent(path: string): Promise<LessonContent | undefined> {
  const entry = courseEntryByPath.get(path);
  if (!entry) return undefined;
  if (entry.isPracticum) {
    return {
      ...entry,
      exercises: await exercisesFor(entry.lesson.exerciseOrder),
      markdown: (await Object.entries(practicumMarkdownModules).find(([file]) => file.endsWith(`/practicums/${entry.lesson.slug}/practicum.md`))?.[1]?.()) ?? ""
    };
  }
  const sourcePath = Object.entries(lessonModules).find(([, lesson]) => lesson.id === entry.lesson.id)?.[0];
  const markdownLoader = sourcePath ? markdownModules[sourcePath.replace(/lesson\.json$/, "lesson.md")] : undefined;
  return {
    ...entry,
    exercises: await exercisesFor(entry.lesson.exerciseOrder),
    markdown: markdownLoader ? await markdownLoader() : ""
  };
}
