import courseData from "../../content/python/course.json";
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
  sections: { id: string; title: string; lessonIds: string[] }[];
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

const lessonModules = import.meta.glob("../../content/python/sections/**/lesson.json", {
  eager: true,
  import: "default"
}) as Record<string, Lesson>;
const practicumModules = import.meta.glob("../../content/python/practicums/**/practicum.json", {
  eager: true,
  import: "default"
}) as Record<string, Practicum>;
const exerciseModules = import.meta.glob("../../content/python/**/exercises/*.json", {
  eager: true,
  import: "default"
}) as Record<string, Exercise>;
const markdownModules = import.meta.glob("../../content/python/sections/**/lesson.md", {
  eager: true,
  as: "raw"
}) as Record<string, string>;
const fixtureModules = import.meta.glob("../../content/python/fixtures/**/*", {
  eager: true,
  as: "raw"
}) as Record<string, string>;

const course = courseData as Course;
const lessonById = new Map(Object.values(lessonModules).map((lesson) => [lesson.id, lesson]));
const practicumById = new Map(Object.values(practicumModules).map((practicum) => [practicum.id, practicum]));
const exerciseById = new Map(Object.values(exerciseModules).map((exercise) => [exercise.id, exercise]));
const markdownByLessonId = new Map(
  Object.entries(lessonModules).map(([path, lesson]) => [
    lesson.id,
    markdownModules[path.replace(/lesson\.json$/, "lesson.md")] ?? ""
  ])
);
const fixtureContents = new Map(
  Object.entries(fixtureModules).map(([path, contents]) => [
    path.split("/content/python/").at(-1) ?? path,
    contents
  ])
);

function resolveFixtures(exercise: Exercise): Exercise {
  if (exercise.judge.type !== "files") return exercise;
  const resolveFile = (file: { path: string; content?: string; fixture?: string }) => {
    if (typeof file.content === "string") return { path: file.path, content: file.content };
    const content = file.fixture ? fixtureContents.get(file.fixture) : undefined;
    if (typeof content !== "string") throw new Error(`Не найден fixture ${file.fixture ?? file.path}`);
    return { path: file.path, content };
  };
  return {
    ...exercise,
    fileExamples: exercise.fileExamples?.map((example) => ({ ...example, files: example.files.map(resolveFile) })),
    judge: {
      ...exercise.judge,
      tests: exercise.judge.tests.map((test) => ({
        ...test,
        inputFiles: test.inputFiles.map(resolveFile),
        expectedFiles: test.expectedFiles?.map(resolveFile)
      }))
    }
  };
}

const exercisesFor = (ids: string[]) => ids.map((id) => {
  const exercise = exerciseById.get(id);
  if (!exercise) throw new Error(`Не найдено упражнение ${id}`);
  return resolveFixtures(exercise);
});

const contents: LessonContent[] = [];
for (const sequenceItem of course.sequence) {
  if (sequenceItem.type === "section") {
    const section = course.sections.find((item) => item.id === sequenceItem.id);
    if (!section) continue;
    for (const lessonId of section.lessonIds) {
      const lesson = lessonById.get(lessonId);
      if (!lesson) throw new Error(`Не найден урок ${lessonId}`);
      contents.push({
        path: `/python/${lesson.sectionId}/${lesson.slug}`,
        sectionTitle: section.title,
        lesson,
        exercises: exercisesFor(lesson.exerciseOrder),
        markdown: markdownByLessonId.get(lesson.id) ?? ""
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
  contents.push({
    path: `/python/practicums/${practicum.slug}`,
    sectionTitle: "Практикумы",
    lesson,
    exercises: exercisesFor(practicum.exerciseOrder),
    markdown: `# ${practicum.title}\n\nРешите задачи по порядку. Если застряли, вернитесь к уроку соответствующего раздела и разберите пример ещё раз.`,
    isPracticum: true
  });
}

export const lessonContents = contents;
export const lessonContentByPath = new Map(lessonContents.map((content) => [content.path, content]));
