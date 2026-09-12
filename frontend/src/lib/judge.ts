import type {
  Comparison,
  Exercise,
  FileFixture,
  FilesJudge,
  FunctionJudge,
  JsonValue,
  JudgeResult,
  JudgeTestResult,
  StdinStdoutJudge
} from "../types";
import type { PythonRuntime } from "./python-runtime";

export function normalizedText(value: string) {
  const lines = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));
  while (lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

export function outputsEqual(actual: string, expected: string, comparison: Comparison) {
  if (comparison.mode === "normalized_text")
    return normalizedText(actual) === normalizedText(expected);
  const actualTokens = actual.trim().split(/\s+/).filter(Boolean);
  const expectedTokens = expected.trim().split(/\s+/).filter(Boolean);
  if (actualTokens.length !== expectedTokens.length) return false;
  if (comparison.mode === "tokens")
    return actualTokens.every((value, index) => value === expectedTokens[index]);
  const absolute = comparison.absoluteTolerance ?? 0.000001;
  const relative = comparison.relativeTolerance ?? 0.000001;
  return actualTokens.every((value, index) => {
    const actualNumber = Number(value);
    const expectedNumber = Number(expectedTokens[index]);
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber))
      return value === expectedTokens[index];
    return (
      Math.abs(actualNumber - expectedNumber) <=
      Math.max(absolute, relative * Math.abs(expectedNumber))
    );
  });
}

async function structuralFailure(
  runtime: PythonRuntime,
  exercise: Exercise,
  source: string
): Promise<JudgeResult | null> {
  const constraints = exercise.judge.structuralConstraints;
  if (!constraints) return null;
  const result = await runtime.checkStructure(source, constraints);
  if (result.kind === "success" && result.violations.length === 0) return null;
  const message =
    result.kind === "success"
      ? result.violations.join(" ")
      : result.kind === "syntax_error"
        ? `Сначала исправьте синтаксис: ${result.message}`
        : result.message;
  return {
    passed: false,
    passedTests: 0,
    totalTests: exercise.judge.tests.length,
    tests: [],
    message
  };
}

export async function judgeStdinStdout(
  runtime: PythonRuntime,
  exercise: Exercise & { judge: StdinStdoutJudge },
  source: string
): Promise<JudgeResult> {
  const structural = await structuralFailure(runtime, exercise, source);
  if (structural) return structural;
  let passedTests = 0;
  const tests: JudgeTestResult[] = [];
  for (const [index, test] of exercise.judge.tests.entries()) {
    const result = await runtime.run(source, test.input);
    if (result.kind === "timeout") {
      tests.push({
        number: index + 1,
        input: test.input,
        expected: test.expectedOutput,
        actual: result.stdout,
        status: "timeout"
      });
      return {
        passed: false,
        passedTests,
        totalTests: exercise.judge.tests.length,
        tests,
        message: `Тест ${index + 1}: превышено время выполнения`
      };
    }
    if (result.kind === "output_limit") {
      tests.push({
        number: index + 1,
        input: test.input,
        expected: test.expectedOutput,
        actual: result.stdout,
        status: "output_limit"
      });
      return {
        passed: false,
        passedTests,
        totalTests: exercise.judge.tests.length,
        tests,
        message: `Тест ${index + 1}: превышен лимит вывода`
      };
    }
    if (result.kind === "exception") {
      tests.push({
        number: index + 1,
        input: test.input,
        expected: test.expectedOutput,
        actual: result.stdout || result.message,
        status: "exception"
      });
      return {
        passed: false,
        passedTests,
        totalTests: exercise.judge.tests.length,
        tests,
        message: `Тест ${index + 1}: ошибка Python — ${result.message}`
      };
    }
    if (!outputsEqual(result.stdout, test.expectedOutput, exercise.judge.comparison)) {
      tests.push({
        number: index + 1,
        input: test.input,
        expected: test.expectedOutput,
        actual: result.stdout,
        status: "wrong_answer"
      });
      return {
        passed: false,
        passedTests,
        totalTests: exercise.judge.tests.length,
        tests,
        message: `Тест ${index + 1} не пройден. ${passedTests} / ${exercise.judge.tests.length} тестов пройдено.`,
        failure: { input: test.input, expected: test.expectedOutput, actual: result.stdout }
      };
    }
    tests.push({
      number: index + 1,
      input: test.input,
      expected: test.expectedOutput,
      actual: result.stdout,
      status: "passed"
    });
    passedTests += 1;
  }
  return {
    passed: true,
    passedTests,
    totalTests: exercise.judge.tests.length,
    tests,
    message: `Все тесты пройдены: ${passedTests} / ${exercise.judge.tests.length}.`
  };
}

function showFiles(files: FileFixture[]): string {
  if (files.length === 0) return "(нет файлов)";
  return files
    .map((file) => `Файл ${file.path}:\n${file.content ?? "(содержимое недоступно)"}`)
    .join("\n\n");
}

function showExpectedFiles(test: FilesJudge["tests"][number]): string {
  const parts: string[] = [];
  if (typeof test.expectedStdout === "string") parts.push(`Вывод:\n${test.expectedStdout}`);
  if (test.expectedFiles?.length) parts.push(showFiles(test.expectedFiles));
  return parts.join("\n\n");
}

function showActualFiles(
  stdout: string,
  expectedStdout: string | undefined,
  expectedFiles: FileFixture[] | undefined,
  files: Record<string, string | null>
): string {
  const parts: string[] = [];
  if (typeof expectedStdout === "string") parts.push(`Вывод:\n${stdout}`);
  if (expectedFiles?.length) {
    parts.push(
      expectedFiles
        .map((file) => {
          const value = files[file.path];
          return value === null || typeof value === "undefined"
            ? `Файл ${file.path}:\n(не создан)`
            : `Файл ${file.path}:\n${value}`;
        })
        .join("\n\n")
    );
  }
  return parts.join("\n\n");
}

export async function judgeFiles(
  runtime: PythonRuntime,
  exercise: Exercise & { judge: FilesJudge },
  source: string
): Promise<JudgeResult> {
  const structural = await structuralFailure(runtime, exercise, source);
  if (structural) return structural;
  let passedTests = 0;
  const tests: JudgeTestResult[] = [];
  const comparison = exercise.judge.comparison ?? { mode: "normalized_text" as const };
  for (const [index, test] of exercise.judge.tests.entries()) {
    const expectedFiles = test.expectedFiles ?? [];
    const result = await runtime.runFiles(
      source,
      test.inputFiles,
      expectedFiles.map((file) => file.path)
    );
    const base = {
      number: index + 1,
      input: showFiles(test.inputFiles),
      inputLabel: "Файлы для запуска",
      expected: showExpectedFiles(test)
    };
    if (result.kind === "timeout" || result.kind === "output_limit") {
      tests.push({ ...base, actual: result.stdout, status: result.kind });
      return {
        passed: false,
        passedTests,
        totalTests: exercise.judge.tests.length,
        tests,
        message: `Тест ${index + 1}: ${result.kind === "timeout" ? "превышено время выполнения" : "превышен лимит вывода"}`
      };
    }
    if (result.kind === "exception") {
      tests.push({ ...base, actual: result.stdout || result.message, status: "exception" });
      return {
        passed: false,
        passedTests,
        totalTests: exercise.judge.tests.length,
        tests,
        message: `Тест ${index + 1}: ошибка Python — ${result.message}`
      };
    }
    const stdoutMatches =
      typeof test.expectedStdout !== "string" ||
      outputsEqual(result.stdout, test.expectedStdout, comparison);
    const missingFile = expectedFiles.find(
      (file) => result.files[file.path] === null || typeof result.files[file.path] === "undefined"
    );
    const filesMatch = expectedFiles.every(
      (file) =>
        result.files[file.path] !== null &&
        typeof result.files[file.path] !== "undefined" &&
        outputsEqual(result.files[file.path] ?? "", file.content ?? "", comparison)
    );
    const actual = showActualFiles(result.stdout, test.expectedStdout, expectedFiles, result.files);
    if (!stdoutMatches || !filesMatch) {
      tests.push({ ...base, actual, status: "wrong_answer" });
      return {
        passed: false,
        passedTests,
        totalTests: exercise.judge.tests.length,
        tests,
        message: missingFile
          ? `Тест ${index + 1}: не найден файл ${missingFile.path}.`
          : `Тест ${index + 1} не пройден. ${passedTests} / ${exercise.judge.tests.length} тестов пройдено.`
      };
    }
    tests.push({ ...base, actual, status: "passed" });
    passedTests += 1;
  }
  return {
    passed: true,
    passedTests,
    totalTests: exercise.judge.tests.length,
    tests,
    message: `Все тесты пройдены: ${passedTests} / ${exercise.judge.tests.length}.`
  };
}

function jsonEqual(actual: JsonValue, expected: JsonValue): boolean {
  if (actual === expected) return true;
  if (
    typeof actual !== "object" ||
    actual === null ||
    typeof expected !== "object" ||
    expected === null
  )
    return false;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((value, index) => jsonEqual(value, expected[index]))
    );
  }
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key, index) => key === expectedKeys[index] && jsonEqual(actual[key], expected[key])
    )
  );
}

function showPythonValue(value: JsonValue): string {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(showPythonValue).join(", ")}]`;

  return `{${Object.entries(value)
    .map(([key, item]) => `${JSON.stringify(key)}: ${showPythonValue(item)}`)
    .join(", ")}}`;
}

function showFunctionCall(functionName: string, args: JsonValue[]): string {
  return `${functionName}(${args.map(showPythonValue).join(", ")})`;
}

export async function judgeFunction(
  runtime: PythonRuntime,
  exercise: Exercise & { judge: FunctionJudge },
  source: string
): Promise<JudgeResult> {
  const structural = await structuralFailure(runtime, exercise, source);
  if (structural) return structural;
  let passedTests = 0;
  const tests: JudgeTestResult[] = [];
  for (const [index, test] of exercise.judge.tests.entries()) {
    const result = await runtime.callFunction(source, exercise.judge.functionName, test.args);
    const expected =
      "expectedException" in test
        ? `Исключение ${test.expectedException}`
        : showPythonValue(test.expectedReturn);
    const base = {
      number: index + 1,
      input: showFunctionCall(exercise.judge.functionName, test.args),
      inputLabel: "Вызов функции",
      expected
    };
    if (result.kind === "timeout" || result.kind === "output_limit") {
      tests.push({ ...base, actual: result.stdout, status: result.kind });
      return {
        passed: false,
        passedTests,
        totalTests: exercise.judge.tests.length,
        tests,
        message: `Тест ${index + 1}: ${result.kind === "timeout" ? "превышено время выполнения" : "превышен лимит вывода"}`
      };
    }
    if (result.kind === "exception") {
      const passed = "expectedException" in test && result.exceptionType === test.expectedException;
      tests.push({
        ...base,
        actual: `${result.exceptionType}: ${result.message}`,
        status: passed ? "passed" : "exception"
      });
      if (!passed) {
        const missing =
          result.exceptionType === "NameError" &&
          result.message.includes(exercise.judge.functionName);
        return {
          passed: false,
          passedTests,
          totalTests: exercise.judge.tests.length,
          tests,
          message: missing
            ? `Тест ${index + 1}: функция ${exercise.judge.functionName} не найдена.`
            : `Тест ${index + 1}: ошибка ${result.exceptionType} — ${result.message}`
        };
      }
      passedTests += 1;
      continue;
    }
    const expectedReturn = test.expectedReturn as JsonValue;
    const passed = "expectedReturn" in test && jsonEqual(result.value, expectedReturn);
    tests.push({
      ...base,
      actual: showPythonValue(result.value),
      status: passed ? "passed" : "wrong_answer"
    });
    if (!passed) {
      return {
        passed: false,
        passedTests,
        totalTests: exercise.judge.tests.length,
        tests,
        message: `Тест ${index + 1} не пройден: функция должна вернуть значение, а не напечатать его.`
      };
    }
    passedTests += 1;
  }
  return {
    passed: true,
    passedTests,
    totalTests: exercise.judge.tests.length,
    tests,
    message: `Все тесты пройдены: ${passedTests} / ${exercise.judge.tests.length}.`
  };
}
