export type Comparison = {
  mode: "normalized_text" | "tokens" | "float_tokens";
  absoluteTolerance?: number;
  relativeTolerance?: number;
};

export type StructuralConstraints = {
  requireFunctions?: string[];
  forbidCalls?: string[];
  forbidMethods?: string[];
  forbidImports?: string[];
  requireRecursion?: string[];
};

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type StdinStdoutTestCase = { input: string; expectedOutput: string };
export type FunctionTestCase =
  | { args: JsonValue[]; expectedReturn: JsonValue; expectedException?: never }
  | { args: JsonValue[]; expectedException: string; expectedReturn?: never };

export type StdinStdoutJudge = {
  type: "stdin_stdout";
  comparison: Comparison;
  tests: StdinStdoutTestCase[];
  structuralConstraints?: StructuralConstraints;
};

export type FunctionJudge = {
  type: "function";
  functionName: string;
  tests: FunctionTestCase[];
  structuralConstraints?: StructuralConstraints;
};

export type FileFixture = {
  path: string;
  content?: string;
  fixture?: string;
};

export type FileTestCase = {
  inputFiles: FileFixture[];
  expectedStdout?: string;
  expectedFiles?: FileFixture[];
};

export type FilesJudge = {
  type: "files";
  comparison?: Comparison;
  tests: FileTestCase[];
  structuralConstraints?: StructuralConstraints;
};

export type FileExample = {
  title: string;
  files: FileFixture[];
};

export type Exercise = {
  id: string;
  owner: { type: "lesson" | "practicum"; id: string };
  kind: "guided" | "checkpoint" | "practicum" | "manual";
  title: string;
  statement: string;
  difficulty: "intro" | "standard" | "challenge";
  starterCode: string;
  hints: string[];
  solution: string;
  examples: { input: string; output: string }[];
  fileExamples?: FileExample[];
  judge: StdinStdoutJudge | FunctionJudge | FilesJudge;
};

export type Lesson = {
  id: string;
  sectionId: string;
  title: string;
  slug: string;
  readingMinutes?: number;
  practiceMinutes?: number;
  tags?: string[];
  sourcePaths?: string[];
  skillIds: string[];
  exerciseOrder: string[];
  checkpointExerciseId: string;
};

export type RunResult =
  | { kind: "success"; stdout: string; stderr: string }
  | { kind: "exception"; stdout: string; stderr: string; message: string }
  | { kind: "timeout"; stdout: string; stderr: string; message: string }
  | { kind: "output_limit"; stdout: string; stderr: string; message: string };

export type FunctionRunResult =
  | { kind: "return"; value: JsonValue; stdout: string; stderr: string }
  | { kind: "exception"; exceptionType: string; message: string; stdout: string; stderr: string }
  | { kind: "timeout"; stdout: string; stderr: string; message: string }
  | { kind: "output_limit"; stdout: string; stderr: string; message: string };

export type FileRunResult =
  | { kind: "success"; stdout: string; stderr: string; files: Record<string, string | null> }
  | { kind: "exception"; stdout: string; stderr: string; message: string }
  | { kind: "timeout"; stdout: string; stderr: string; message: string }
  | { kind: "output_limit"; stdout: string; stderr: string; message: string };

export type StructureRunResult =
  | { kind: "success"; violations: string[] }
  | { kind: "syntax_error"; message: string }
  | { kind: "exception"; message: string }
  | { kind: "timeout"; message: string };

export type JudgeResult = {
  passed: boolean;
  passedTests: number;
  totalTests: number;
  message: string;
  tests: JudgeTestResult[];
  failure?: { input: string; expected: string; actual: string };
};

export type JudgeTestResult = {
  number: number;
  input: string;
  inputLabel?: string;
  expected: string;
  actual: string;
  status: "passed" | "wrong_answer" | "timeout" | "output_limit" | "exception";
};
