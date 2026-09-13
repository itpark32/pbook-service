import { describe, expect, it } from "vitest";
import { withCount } from "./russian";

describe("Russian pluralization", () => {
  it("uses correct forms", () => {
    expect([1, 2, 4, 5, 11, 21, 22, 25].map((value) => withCount(value, ["ученик", "ученика", "учеников"]))).toEqual([
      "1 ученик", "2 ученика", "4 ученика", "5 учеников", "11 учеников", "21 ученик", "22 ученика", "25 учеников"
    ]);
  });
});
