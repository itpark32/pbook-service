import { describe, expect, it } from "vitest";
import { judgeFiles, judgeFunction, judgeStdinStdout, normalizedText, outputsEqual } from "./judge";
import type { Exercise } from "../types";

describe("stdin/stdout comparators", () => {
  it("normalizes only permitted whitespace", () => {
    expect(normalizedText("30   \r\n\n")).toBe("30");
    expect(outputsEqual("30   \n", "30\n", { mode: "normalized_text" })).toBe(true);
    expect(outputsEqual("3 0", "30", { mode: "normalized_text" })).toBe(false);
  });

  it("compares tokens and floats", () => {
    expect(outputsEqual("1  2\n", "1\n2", { mode: "tokens" })).toBe(true);
    expect(
      outputsEqual("1.0000004", "1", { mode: "float_tokens", absoluteTolerance: 0.000001 })
    ).toBe(true);
    expect(outputsEqual("1.1", "1", { mode: "float_tokens", absoluteTolerance: 0.000001 })).toBe(
      false
    );
  });

  it("keeps the input, expected output, and actual output for each passed test", async () => {
    const exercise = {
      judge: {
        type: "stdin_stdout",
        comparison: { mode: "normalized_text" },
        tests: [
          { input: "2\n", expectedOutput: "4\n" },
          { input: "3\n", expectedOutput: "6\n" }
        ]
      }
    } as Exercise;
    const runtime = {
      run: async (_source: string, input: string) => ({
        kind: "success" as const,
        stdout: input === "2\n" ? "4\n" : "6\n",
        stderr: ""
      })
    };

    const result = await judgeStdinStdout(runtime as never, exercise as never, "print()\n");

    expect(result.passed).toBe(true);
    expect(result.tests).toEqual([
      { number: 1, input: "2\n", expected: "4\n", actual: "4\n", status: "passed" },
      { number: 2, input: "3\n", expected: "6\n", actual: "6\n", status: "passed" }
    ]);
  });

  it("judges function existence and return values instead of stdout", async () => {
    const exercise = {
      judge: {
        type: "function",
        functionName: "is_even",
        tests: [{ args: [2], expectedReturn: true }]
      }
    } as Exercise;
    const runtime = {
      callFunction: async () => ({ kind: "return" as const, value: true, stdout: "", stderr: "" })
    };

    await expect(judgeFunction(runtime as never, exercise as never, "")).resolves.toMatchObject({
      passed: true,
      passedTests: 1
    });
    await expect(
      judgeFunction(
        {
          callFunction: async () => ({
            kind: "exception" as const,
            exceptionType: "NameError",
            message: "Функция is_even не найдена",
            stdout: "",
            stderr: ""
          })
        } as never,
        exercise as never,
        ""
      )
    ).resolves.toMatchObject({ passed: false, message: "Тест 1: функция is_even не найдена." });
    await expect(
      judgeFunction(
        {
          callFunction: async () => ({
            kind: "return" as const,
            value: false,
            stdout: "True\n",
            stderr: ""
          })
        } as never,
        exercise as never,
        ""
      )
    ).resolves.toMatchObject({
      passed: false,
      tests: [
        {
          input: "is_even(2)",
          inputLabel: "Вызов функции",
          expected: "True",
          actual: "False",
          status: "wrong_answer"
        }
      ]
    });
  });

  it("judges stdout and output files for each isolated file test", async () => {
    const exercise = {
      judge: {
        type: "files",
        comparison: { mode: "normalized_text" },
        tests: [
          {
            inputFiles: [{ path: "numbers.txt", content: "10\n20\n" }],
            expectedStdout: "30\n"
          },
          {
            inputFiles: [{ path: "input.txt", content: "7\n" }],
            expectedFiles: [{ path: "output.txt", content: "14\n" }]
          }
        ]
      }
    } as Exercise;
    const calls: string[] = [];
    const runtime = {
      runFiles: async (_source: string, files: { path: string; content?: string }[]) => {
        calls.push(files[0].path);
        return files[0].path === "numbers.txt"
          ? { kind: "success" as const, stdout: "30\n", stderr: "", files: {} }
          : {
              kind: "success" as const,
              stdout: "",
              stderr: "",
              files: { "output.txt": "14\n" }
            };
      }
    };

    const result = await judgeFiles(runtime as never, exercise as never, "");

    expect(result.passed).toBe(true);
    expect(calls).toEqual(["numbers.txt", "input.txt"]);
    expect(result.tests[1]).toMatchObject({
      inputLabel: "Файлы для запуска",
      expected: "Файл output.txt:\n14\n",
      actual: "Файл output.txt:\n14\n"
    });
  });

  it("reports a missing output file in a file exercise", async () => {
    const exercise = {
      judge: {
        type: "files",
        tests: [
          {
            inputFiles: [{ path: "input.txt", content: "1\n" }],
            expectedFiles: [{ path: "output.txt", content: "2\n" }]
          }
        ]
      }
    } as Exercise;
    const runtime = {
      runFiles: async () => ({ kind: "success" as const, stdout: "", stderr: "", files: {} })
    };

    await expect(judgeFiles(runtime as never, exercise as never, "")).resolves.toMatchObject({
      passed: false,
      message: "Тест 1: не найден файл output.txt."
    });
  });

  it("stops functional checking when the required recursive call is missing", async () => {
    const exercise = {
      judge: {
        type: "function",
        functionName: "factorial",
        structuralConstraints: { requireFunctions: ["factorial"], requireRecursion: ["factorial"] },
        tests: [{ args: [4], expectedReturn: 24 }]
      }
    } as Exercise;
    const runtime = {
      checkStructure: async () => ({
        kind: "success" as const,
        violations: ["В функции factorial() нужен вызов самой себя."]
      }),
      callFunction: async () => {
        throw new Error("functional judge must not run");
      }
    };

    await expect(judgeFunction(runtime as never, exercise as never, "")).resolves.toMatchObject({
      passed: false,
      message: "В функции factorial() нужен вызов самой себя.",
      tests: []
    });
  });
});
