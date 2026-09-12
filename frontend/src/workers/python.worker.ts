type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type RunRequest = { id: number; type: "run"; source: string; stdin: string; outputLimit: number };
type FunctionRequest = {
  id: number;
  type: "function";
  source: string;
  functionName: string;
  args: JsonValue[];
  outputLimit: number;
};
type FileInput = { path: string; content: string };
type FilesRequest = {
  id: number;
  type: "files";
  source: string;
  inputFiles: FileInput[];
  expectedFilePaths: string[];
  outputLimit: number;
};
type StructuralConstraints = {
  requireFunctions?: string[];
  forbidCalls?: string[];
  forbidMethods?: string[];
  forbidImports?: string[];
  requireRecursion?: string[];
};
type StructureRequest = {
  id: number;
  type: "structure";
  source: string;
  constraints: StructuralConstraints;
  outputLimit: number;
};
type PythonRequest = RunRequest | FunctionRequest | FilesRequest | StructureRequest;
type PythonResponse =
  | { id: number; kind: "ready" }
  | { id: number; kind: "success"; stdout: string; stderr: string }
  | {
      id: number;
      kind: "exception" | "output_limit";
      stdout: string;
      stderr: string;
      message: string;
    }
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

type PyProxy = { destroy?: () => void; toJs?: () => unknown };
type PyodideRuntime = {
  setStdout: (options: { batched: (value: string) => void }) => void;
  setStderr: (options: { batched: (value: string) => void }) => void;
  setStdin: (options: { stdin: () => string }) => void;
  toPy: (value: Record<string, string>) => PyProxy;
  runPythonAsync: (source: string, options: { globals: PyProxy }) => Promise<PyProxy | undefined>;
};

let pyodide: PyodideRuntime | undefined;

async function getPyodide() {
  if (!pyodide) {
    const moduleUrl = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.mjs";
    const module = (await import(/* @vite-ignore */ moduleUrl)) as {
      loadPyodide: (options: { indexURL: string }) => Promise<PyodideRuntime>;
    };
    pyodide = await module.loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/"
    });
  }
  return pyodide;
}

function functionHarness(source: string, functionName: string, args: JsonValue[]) {
  return `
import json as __pbook_json
__pbook_source = ${JSON.stringify(source)}
__pbook_function_name = ${JSON.stringify(functionName)}
__pbook_args = __pbook_json.loads(${JSON.stringify(JSON.stringify(args))})
try:
    exec(compile(__pbook_source, "<student>", "exec"), globals())
    __pbook_function = globals().get(__pbook_function_name)
    if not callable(__pbook_function):
        raise NameError(f"Функция {__pbook_function_name} не найдена")
    __pbook_value = __pbook_function(*__pbook_args)
    __pbook_json.dumps(__pbook_value, ensure_ascii=False, allow_nan=False)
    __pbook_outcome = {"kind": "return", "value": __pbook_value}
except BaseException as __pbook_error:
    __pbook_outcome = {
        "kind": "exception",
        "exceptionType": type(__pbook_error).__name__,
        "message": str(__pbook_error)
    }
__pbook_json.dumps(__pbook_outcome, ensure_ascii=False, allow_nan=False)
`;
}

function filesHarness(
  source: string,
  inputFiles: FileInput[],
  expectedFilePaths: string[],
  runId: number
) {
  return `
import json as __pbook_json
import os as __pbook_os
import shutil as __pbook_shutil
import tempfile as __pbook_tempfile
__pbook_source = ${JSON.stringify(source)}
__pbook_input_files = __pbook_json.loads(${JSON.stringify(JSON.stringify(inputFiles))})
__pbook_expected_paths = __pbook_json.loads(${JSON.stringify(JSON.stringify(expectedFilePaths))})
__pbook_root = __pbook_tempfile.mkdtemp(prefix=${JSON.stringify(`pbook-${runId}-`)})
__pbook_previous_cwd = __pbook_os.getcwd()

def __pbook_file_path(__pbook_relative_path):
    __pbook_path = __pbook_os.path.normpath(__pbook_os.path.join(__pbook_root, __pbook_relative_path))
    if __pbook_os.path.commonpath([__pbook_root, __pbook_path]) != __pbook_root:
        raise ValueError("Небезопасный путь к файлу")
    return __pbook_path

try:
    for __pbook_file in __pbook_input_files:
        __pbook_path = __pbook_file_path(__pbook_file["path"])
        __pbook_parent = __pbook_os.path.dirname(__pbook_path)
        if __pbook_parent:
            __pbook_os.makedirs(__pbook_parent, exist_ok=True)
        with open(__pbook_path, "w", encoding="utf-8") as __pbook_handle:
            __pbook_handle.write(__pbook_file["content"])
    __pbook_os.chdir(__pbook_root)
    exec(compile(__pbook_source, "<student>", "exec"), globals())
    __pbook_files = {}
    for __pbook_relative_path in __pbook_expected_paths:
        __pbook_path = __pbook_file_path(__pbook_relative_path)
        if not __pbook_os.path.isfile(__pbook_path):
            __pbook_files[__pbook_relative_path] = None
        else:
            with open(__pbook_path, encoding="utf-8") as __pbook_handle:
                __pbook_files[__pbook_relative_path] = __pbook_handle.read()
    __pbook_outcome = {"kind": "success", "files": __pbook_files}
except BaseException as __pbook_error:
    __pbook_outcome = {"kind": "exception", "message": f"{type(__pbook_error).__name__}: {__pbook_error}"}
finally:
    __pbook_os.chdir(__pbook_previous_cwd)
    __pbook_shutil.rmtree(__pbook_root, ignore_errors=True)
__pbook_json.dumps(__pbook_outcome, ensure_ascii=False)
`;
}

function structureHarness(source: string, constraints: StructuralConstraints) {
  return `
import ast as __pbook_ast
import json as __pbook_json
__pbook_source = ${JSON.stringify(source)}
__pbook_constraints = __pbook_json.loads(${JSON.stringify(JSON.stringify(constraints))})

class __pbook_call_collector(__pbook_ast.NodeVisitor):
    def __init__(self):
        self.calls = set()
        self.methods = set()
        self.imports = set()

    def visit_Call(self, node):
        if isinstance(node.func, __pbook_ast.Name):
            self.calls.add(node.func.id)
        elif isinstance(node.func, __pbook_ast.Attribute):
            self.methods.add(node.func.attr)
        self.generic_visit(node)

    def visit_Import(self, node):
        for alias in node.names:
            self.imports.add(alias.name.split(".")[0])

    def visit_ImportFrom(self, node):
        if node.module:
            self.imports.add(node.module.split(".")[0])

try:
    __pbook_tree = __pbook_ast.parse(__pbook_source)
    __pbook_functions = {
        node.name: node
        for node in __pbook_ast.walk(__pbook_tree)
        if isinstance(node, (__pbook_ast.FunctionDef, __pbook_ast.AsyncFunctionDef))
    }
    __pbook_collector = __pbook_call_collector()
    __pbook_collector.visit(__pbook_tree)
    __pbook_violations = []
    for __pbook_name in __pbook_constraints.get("requireFunctions", []):
        if __pbook_name not in __pbook_functions:
            __pbook_violations.append(f"Нужна функция {__pbook_name}().")
    for __pbook_name in __pbook_constraints.get("forbidCalls", []):
        if __pbook_name in __pbook_collector.calls:
            __pbook_violations.append(f"Не используйте {__pbook_name}() в этой задаче.")
    for __pbook_name in __pbook_constraints.get("forbidMethods", []):
        if __pbook_name in __pbook_collector.methods:
            __pbook_violations.append(f"Не используйте метод .{__pbook_name}() в этой задаче.")
    for __pbook_name in __pbook_constraints.get("forbidImports", []):
        if __pbook_name in __pbook_collector.imports:
            __pbook_violations.append(f"Не импортируйте {__pbook_name} в этой задаче.")
    for __pbook_name in __pbook_constraints.get("requireRecursion", []):
        __pbook_function = __pbook_functions.get(__pbook_name)
        if __pbook_function is None:
            __pbook_violations.append(f"Нужна рекурсивная функция {__pbook_name}().")
            continue
        __pbook_recursive_calls = [
            node
            for node in __pbook_ast.walk(__pbook_function)
            if isinstance(node, __pbook_ast.Call)
            and isinstance(node.func, __pbook_ast.Name)
            and node.func.id == __pbook_name
        ]
        if not __pbook_recursive_calls:
            __pbook_violations.append(f"В функции {__pbook_name}() нужен вызов самой себя.")
    __pbook_outcome = {"kind": "success", "violations": __pbook_violations}
except SyntaxError as __pbook_error:
    __pbook_outcome = {"kind": "syntax_error", "message": __pbook_error.msg}
except BaseException as __pbook_error:
    __pbook_outcome = {"kind": "exception", "message": str(__pbook_error)}
__pbook_json.dumps(__pbook_outcome, ensure_ascii=False)
`;
}

self.onmessage = async ({ data }: MessageEvent<PythonRequest>) => {
  let stdout = "";
  let stderr = "";
  try {
    const runtime = await getPyodide();
    const inputs = (data.type === "run" ? data.stdin : "").replace(/\r\n?/g, "\n").split("\n");
    if (inputs[inputs.length - 1] === "") inputs.pop();
    let inputIndex = 0;
    const append = (target: "stdout" | "stderr", value: string) => {
      if (stdout.length + stderr.length + value.length > data.outputLimit) {
        const error = new Error("Превышен лимит вывода (1 МиБ).");
        error.name = "OutputLimitError";
        throw error;
      }
      if (target === "stdout") stdout += value;
      else stderr += value;
    };
    runtime.setStdout({ batched: (value: string) => append("stdout", `${value}\n`) });
    runtime.setStderr({ batched: (value: string) => append("stderr", `${value}\n`) });
    runtime.setStdin({ stdin: () => inputs[inputIndex++] ?? "" });
    const globals = runtime.toPy({ __name__: "__main__" });
    try {
      const result = await runtime.runPythonAsync(
        data.type === "function"
          ? functionHarness(data.source, data.functionName, data.args)
          : data.type === "files"
            ? filesHarness(data.source, data.inputFiles, data.expectedFilePaths, data.id)
            : data.type === "structure"
              ? structureHarness(data.source, data.constraints)
              : data.source,
        { globals }
      );
      if (data.type === "function") {
        const serialized = result?.toJs?.() ?? String(result ?? "");
        const outcome = JSON.parse(String(serialized));
        self.postMessage({
          id: data.id,
          kind: "function_result",
          stdout,
          stderr,
          outcome
        } satisfies PythonResponse);
        return;
      }
      if (data.type === "files") {
        const serialized = result?.toJs?.() ?? String(result ?? "");
        const outcome = JSON.parse(String(serialized));
        self.postMessage({
          id: data.id,
          kind: "files_result",
          stdout,
          stderr,
          outcome
        } satisfies PythonResponse);
        return;
      }
      if (data.type === "structure") {
        const serialized = result?.toJs?.() ?? String(result ?? "");
        const outcome = JSON.parse(String(serialized));
        self.postMessage({
          id: data.id,
          kind: "structure_result",
          stdout,
          stderr,
          outcome
        } satisfies PythonResponse);
        return;
      }
      result?.destroy?.();
    } finally {
      globals.destroy?.();
    }
    self.postMessage({ id: data.id, kind: "success", stdout, stderr } satisfies PythonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kind =
      error instanceof Error && error.name === "OutputLimitError" ? "output_limit" : "exception";
    self.postMessage({ id: data.id, kind, stdout, stderr, message } satisfies PythonResponse);
  }
};
