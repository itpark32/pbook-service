import { describe, expect, it } from "vitest";
import { courseEntries, loadLessonContent } from "./content";

describe("lesson content manifest", () => {
  it("exposes every exercise declared by each lesson in its declared order", async () => {
    for (const entry of courseEntries) {
      const content = await loadLessonContent(entry.path);
      expect(content).toBeDefined();
      if (!content) continue;
      expect(content.exercises.map((exercise) => exercise.id)).toEqual(
        content.lesson.exerciseOrder
      );
    }
  });

  it("exposes the complete curriculum and unique direct routes", () => {
    expect(courseEntries.filter((content) => !content.isPracticum)).toHaveLength(49);
    expect(courseEntries.filter((content) => content.isPracticum)).toHaveLength(6);
    expect(new Set(courseEntries.map((content) => content.path)).size).toBe(courseEntries.length);
    expect(new Set(courseEntries.flatMap((content) => content.lesson.skillIds)).size).toBe(46);
  });
});
