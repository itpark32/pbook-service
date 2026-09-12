import PythonWorker from "../workers/python.worker?worker";
import type {
  FileFixture,
  FileRunResult,
  FunctionRunResult,
  JsonValue,
  RunResult,
  StructuralConstraints,
  StructureRunResult
} from "../types";

type WorkerResponse =
  | (Exclude<RunResult, { kind: "timeout" }> & { id: number })
  | {
      id: number;
      kind: "function_result";
      stdout: string;
      stderr: string;
      outcome:
        | { kind: "return"; value: JsonValue }
        | { kind: "exception"; exceptionType: string; message: string };
    }
  | {
      id: number;
      kind: "files_result";
      stdout: string;
      stderr: string;
      outcome:
        | { kind: "success"; files: Record<string, string | null> }
        | { kind: "exception"; message: string };
    }
  | {
      id: number;
      kind: "structure_result";
      stdout: string;
      stderr: string;
      outcome:
        | { kind: "success"; violations: string[] }
        | { kind: "syntax_error"; message: string }
        | { kind: "exception"; message: string };
    };

export class PythonRuntime {
  private worker: Worker | null = null;
  private sequence = 0;
  private readonly timeoutMs = 5000;
  private readonly outputLimit = 1024 * 1024;

  constructor(private readonly onStatus: (status: "loading" | "ready") => void = () => undefined) {}

  private ensureWorker() {
    if (!this.worker) {
      this.onStatus("loading");
      const created = new PythonWorker();
      this.worker = created;
      return created;
    }
    return this.worker;
  }

  private recreate() {
    this.worker?.terminate();
    this.worker = null;
  }

  async run(source: string, stdin: string): Promise<RunResult> {
    const worker = this.ensureWorker();
    const id = ++this.sequence;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        worker.removeEventListener("message", onMessage);
        this.recreate();
        resolve({
          kind: "timeout",
          stdout: "",
          stderr: "",
          message: "Программа выполняется слишком долго. Возможно, в программе бесконечный цикл."
        });
      }, this.timeoutMs);
      const onMessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.id !== id) return;
        window.clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        this.onStatus("ready");
        if (
          data.kind === "function_result" ||
          data.kind === "files_result" ||
          data.kind === "structure_result"
        ) {
          resolve({
            kind: "exception",
            stdout: data.stdout,
            stderr: data.stderr,
            message: "Ручной запуск получил неподдерживаемый ответ judge."
          });
          return;
        }
        resolve(data);
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({ id, type: "run", source, stdin, outputLimit: this.outputLimit });
    });
  }

  async callFunction(
    source: string,
    functionName: string,
    args: JsonValue[]
  ): Promise<FunctionRunResult> {
    const worker = this.ensureWorker();
    const id = ++this.sequence;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        worker.removeEventListener("message", onMessage);
        this.recreate();
        resolve({
          kind: "timeout",
          stdout: "",
          stderr: "",
          message: "Программа выполняется слишком долго. Возможно, в программе бесконечный цикл."
        });
      }, this.timeoutMs);
      const onMessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.id !== id) return;
        window.clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        this.onStatus("ready");
        if (data.kind === "function_result") {
          resolve({ ...data.outcome, stdout: data.stdout, stderr: data.stderr });
          return;
        }
        if (
          data.kind === "success" ||
          data.kind === "files_result" ||
          data.kind === "structure_result"
        ) {
          resolve({
            kind: "exception",
            exceptionType: "RuntimeError",
            message: "Judge не получил результат функции.",
            stdout: data.stdout,
            stderr: data.stderr
          });
          return;
        }
        if (data.kind === "output_limit") {
          resolve(data);
          return;
        }
        resolve({
          kind: "exception",
          exceptionType: "PythonError",
          message: data.message,
          stdout: data.stdout,
          stderr: data.stderr
        });
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({
        id,
        type: "function",
        source,
        functionName,
        args,
        outputLimit: this.outputLimit
      });
    });
  }

  async runFiles(
    source: string,
    inputFiles: FileFixture[],
    expectedFilePaths: string[] = []
  ): Promise<FileRunResult> {
    const worker = this.ensureWorker();
    const id = ++this.sequence;
    const files = inputFiles.map((file) => {
      if (typeof file.content !== "string") {
        throw new Error(`Не удалось подготовить файл ${file.path} для запуска.`);
      }
      return { path: file.path, content: file.content };
    });
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        worker.removeEventListener("message", onMessage);
        this.recreate();
        resolve({
          kind: "timeout",
          stdout: "",
          stderr: "",
          message: "Программа выполняется слишком долго. Возможно, в программе бесконечный цикл."
        });
      }, this.timeoutMs);
      const onMessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.id !== id) return;
        window.clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        this.onStatus("ready");
        if (data.kind === "files_result") {
          resolve({ ...data.outcome, stdout: data.stdout, stderr: data.stderr });
          return;
        }
        if (data.kind === "output_limit") {
          resolve(data);
          return;
        }
        resolve({
          kind: "exception",
          stdout: data.stdout,
          stderr: data.stderr,
          message:
            data.kind === "exception"
              ? data.message
              : "Среда выполнения не получила результат работы с файлами."
        });
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({
        id,
        type: "files",
        source,
        inputFiles: files,
        expectedFilePaths,
        outputLimit: this.outputLimit
      });
    });
  }

  async checkStructure(
    source: string,
    constraints: StructuralConstraints
  ): Promise<StructureRunResult> {
    const worker = this.ensureWorker();
    const id = ++this.sequence;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        worker.removeEventListener("message", onMessage);
        this.recreate();
        resolve({ kind: "timeout", message: "Проверка структуры кода выполняется слишком долго." });
      }, this.timeoutMs);
      const onMessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.id !== id) return;
        window.clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        this.onStatus("ready");
        if (data.kind === "structure_result") {
          resolve(data.outcome);
          return;
        }
        resolve({
          kind: "exception",
          message: "Среда выполнения не получила результат проверки структуры кода."
        });
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({
        id,
        type: "structure",
        source,
        constraints,
        outputLimit: this.outputLimit
      });
    });
  }

  dispose() {
    this.recreate();
  }
}
