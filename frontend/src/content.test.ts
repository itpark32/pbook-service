import { describe, expect, it } from "vitest";
import { lessonContents } from "./content";

describe("lesson content manifest", () => {
  it("exposes every exercise declared by each lesson in its declared order", () => {
    for (const content of lessonContents) {
      expect(content.exercises.map((exercise) => exercise.id)).toEqual(
        content.lesson.exerciseOrder
      );
    }
  });

  it("exposes the complete curriculum and unique direct routes", () => {
    expect(lessonContents.filter((content) => !content.isPracticum)).toHaveLength(47);
    expect(lessonContents.filter((content) => content.isPracticum)).toHaveLength(6);
    expect(lessonContents.flatMap((content) => content.exercises)).toHaveLength(230);
    expect(new Set(lessonContents.map((content) => content.path)).size).toBe(lessonContents.length);
    expect(new Set(lessonContents.flatMap((content) => content.lesson.skillIds)).size).toBe(44);
  });
});
