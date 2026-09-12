import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, Navigate, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { courseEntries, loadLessonContent } from "./content";
import type { LessonContent } from "./content";
import { judgeFiles, judgeFunction, judgeStdinStdout } from "./lib/judge";
import { guestProgress } from "./lib/progress";
import { PythonRuntime } from "./lib/python-runtime";
import { cloudProgress } from "./lib/cloud-progress";
import { InvitePage } from "./InvitePage";
import { TeacherGroupsPage } from "./TeacherGroupsPage";
import { AdminPage } from "./AdminPage";
import type {
  Exercise,
  FileRunResult,
  FilesJudge,
  FunctionJudge,
  JudgeResult,
  RunResult,
  StdinStdoutJudge
} from "./types";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));
let sharedRuntime: PythonRuntime | null = null;
function getSharedRuntime() {
  if (!sharedRuntime) sharedRuntime = new PythonRuntime();
  return sharedRuntime;
}

function safeMarkdownUrl(value: string) {
  const trimmed = value.trim();
  if (/^(https?:|mailto:|#|\/)/i.test(trimmed) || !/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed;
  return "";
}

function printable(value: string) {
  return value || "(пусто)";
}

function Output({
  result,
  judge
}: {
  result: RunResult | FileRunResult | null;
  judge: JudgeResult | null;
}) {
  if (judge) {
    return (
      <section
        className={`result ${judge.passed ? "result--success" : "result--error"}`}
        aria-live="polite"
      >
        <strong>{judge.passed ? "Готово" : "Нужно исправить"}</strong>
        <p>{judge.message}</p>
        {judge.tests.length > 0 && (
          <details className="judge-report" open>
            <summary>Протокол тестов</summary>
            <div className="judge-tests">
              {judge.tests.map((test) => (
                <article
                  className={
                    test.status === "passed" ? "judge-test" : "judge-test judge-test--failed"
                  }
                  key={test.number}
                >
                  <h3>
                    Тест {test.number} {test.status === "passed" ? "пройден" : "не пройден"}
                  </h3>
                  <div className="judge-test-values">
                    <div>
                      <span>{test.inputLabel ?? "Вход"}</span>
                      <pre>{printable(test.input)}</pre>
                    </div>
                    <div>
                      <span>Ожидалось</span>
                      <pre>{printable(test.expected)}</pre>
                    </div>
                    <div>
                      <span>Получено</span>
                      <pre>{printable(test.actual)}</pre>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </details>
        )}
      </section>
    );
  }
  if (!result)
    return <p className="muted">Здесь появится вывод программы или результат проверки.</p>;
  return (
    <section
      className={`result ${result.kind === "success" ? "" : "result--error"}`}
      aria-live="polite"
    >
      {result.kind !== "success" && (
        <strong>{result.kind === "timeout" ? "Превышено время" : "Ошибка Python"}</strong>
      )}
      {result.kind !== "success" && <p>{result.message}</p>}
      {result.stdout && <pre>{result.stdout}</pre>}
      {result.stderr && <pre className="stderr">{result.stderr}</pre>}
      {result.kind === "success" && !result.stdout && !result.stderr && (
        <p>Программа завершилась без вывода.</p>
      )}
    </section>
  );
}

function ExerciseWorkspace({
  exercise,
  lessonId,
  theme,
  onCheckpoint,
  onCompleted
}: {
  exercise: Exercise;
  lessonId: string;
  theme: "light" | "dark";
  onCheckpoint: () => void;
  onCompleted: (exerciseId: string) => void;
}) {
  const runtimeRef = useRef<PythonRuntime | null>(null);
  const [code, setCode] = useState(() => guestProgress.getCode(exercise.id, exercise.starterCode));
  const [stdin, setStdin] = useState(() => guestProgress.getStdin(exercise.id));
  const [result, setResult] = useState<RunResult | FileRunResult | null>(null);
  const [judge, setJudge] = useState<JudgeResult | null>(null);
  const [running, setRunning] = useState(false);
  const [pythonStatus, setPythonStatus] = useState("Python загрузится при первом запуске");
  const [cloudReady, setCloudReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [solutionVisible, setSolutionVisible] = useState(() =>
    guestProgress.solutionRevealed(exercise.id)
  );
  const [isSolutionDialogOpen, setSolutionDialogOpen] = useState(false);
  const [selectedFileExample, setSelectedFileExample] = useState(0);
  const solutionButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCode(guestProgress.getCode(exercise.id, exercise.starterCode));
    setStdin(guestProgress.getStdin(exercise.id));
    setResult(null);
    setJudge(null);
    setSolutionVisible(guestProgress.solutionRevealed(exercise.id));
    setSolutionDialogOpen(false);
    setSelectedFileExample(0);
  }, [exercise]);
  useEffect(() => {
    let active = true;
    setCloudReady(false);
    cloudProgress.load().then((progress) => {
      if (!active) return;
      const saved = progress.exercises.find((item) => item.exerciseId === exercise.id);
      if (saved) {
        if (saved.code !== undefined) setCode(saved.code);
        if (saved.stdin !== undefined) setStdin(saved.stdin);
        if (saved.solutionRevealed) setSolutionVisible(true);
        if (saved.completed) onCompleted(exercise.id);
      }
      setCloudReady(true);
    }).catch(() => active && setCloudReady(false));
    return () => { active = false; };
  // The parent callback is intentionally excluded: a lesson re-render must not reload cloud code.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);
  useEffect(() => {
    if (!isSolutionDialogOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const firstButton = dialogRef.current?.querySelector<HTMLButtonElement>("button");
    firstButton?.focus();
    return () => previousFocus?.focus();
  }, [isSolutionDialogOpen]);
  useEffect(() => {
    const timer = window.setTimeout(() => guestProgress.setCode(exercise.id, code, lessonId), 800);
    return () => window.clearTimeout(timer);
  }, [code, exercise.id, lessonId]);
  useEffect(() => {
    const timer = window.setTimeout(() => guestProgress.setStdin(exercise.id, stdin), 500);
    return () => window.clearTimeout(timer);
  }, [exercise.id, stdin]);
  useEffect(() => {
    if (!cloudReady) return;
    setSaveStatus("Сохранение…");
    const timer = window.setTimeout(() => {
      Promise.all([
        cloudProgress.save(exercise.id, { code, stdin, solutionRevealed: solutionVisible }),
        cloudProgress.saveLesson(lessonId, "in_progress")
      ])
        .then(() => setSaveStatus("Сохранено"))
        .catch(() => setSaveStatus("Не удалось сохранить"));
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [cloudReady, code, stdin, solutionVisible, exercise.id, lessonId]);

  const run = async () => {
    setRunning(true);
    setJudge(null);
    setPythonStatus("Python выполняет программу…");
    const runtime = runtimeRef.current ?? (runtimeRef.current = getSharedRuntime());
    const next =
      exercise.judge.type === "files"
        ? await runtime.runFiles(code, exercise.fileExamples?.[selectedFileExample]?.files ?? [])
        : await runtime.run(code, stdin);
    setResult(next);
    setPythonStatus(
      next.kind === "timeout"
        ? "Worker пересоздан; Python загрузится при следующем запуске"
        : "Python готов"
    );
    setRunning(false);
  };
  const check = async () => {
    setRunning(true);
    setResult(null);
    setPythonStatus("Проверяем тесты…");
    const runtime = runtimeRef.current ?? (runtimeRef.current = getSharedRuntime());
    const next =
      exercise.judge.type === "function"
        ? await judgeFunction(runtime, exercise as Exercise & { judge: FunctionJudge }, code)
        : exercise.judge.type === "files"
          ? await judgeFiles(runtime, exercise as Exercise & { judge: FilesJudge }, code)
          : await judgeStdinStdout(
              runtime,
              exercise as Exercise & { judge: StdinStdoutJudge },
              code
            );
    setJudge(next);
    if (next.passed) {
      guestProgress.completeExercise(exercise.id);
      onCompleted(exercise.id);
      if (exercise.kind === "checkpoint") onCheckpoint();
    }
    if (cloudReady) {
      cloudProgress.attempt(exercise.id, { passed: next.passed, passedTests: next.tests.filter((test) => test.status === "passed").length, totalTests: next.tests.length, lessonId, checkpoint: exercise.kind === "checkpoint" }).catch(() => setSaveStatus("Не удалось сохранить"));
    }
    setPythonStatus("Python готов");
    setRunning(false);
  };
  const closeSolutionDialog = () => setSolutionDialogOpen(false);
  const revealSolution = () => {
    if (solutionVisible) return;
    setSolutionDialogOpen(true);
  };
  const confirmRevealSolution = () => {
    guestProgress.revealSolution(exercise.id);
    setSolutionVisible(true);
    closeSolutionDialog();
  };
  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSolutionDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <section className="workspace" aria-label={`Практика: ${exercise.title}`}>
      <div className="workspace-header">
        <div>
          <p className="eyebrow">
            {exercise.kind === "checkpoint" ? "Контрольная задача" : "Практика"}
          </p>
          <h2>{exercise.title}</h2>
        </div>
        {guestProgress.isComplete(exercise.id) && <span className="complete-badge">Пройдено</span>}
      </div>
      <p>{exercise.statement}</p>
      <details>
        <summary>Подсказки</summary>
        <ol>
          {exercise.hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ol>
      </details>
      {exercise.judge.type === "stdin_stdout" ? (
        <>
          <label htmlFor="stdin">Входные данные</label>
          <textarea
            id="stdin"
            value={stdin}
            onChange={(event) => setStdin(event.target.value)}
            placeholder="Каждая строка станет ответом input()"
            rows={3}
          />
        </>
      ) : null}
      {exercise.judge.type === "files" && exercise.fileExamples?.length ? (
        <section className="file-examples" aria-label="Файлы для запуска">
          <div className="file-examples__heading">
            <div>
              <h3>Файлы для запуска</h3>
              <p>При запуске Python увидит эти файлы в своей рабочей папке.</p>
            </div>
            {exercise.fileExamples.length > 1 && (
              <div className="file-example-tabs" role="tablist" aria-label="Примеры файлов">
                {exercise.fileExamples.map((example, index) => (
                  <button
                    type="button"
                    key={example.title}
                    className={
                      selectedFileExample === index
                        ? "file-example-tab file-example-tab--active"
                        : "file-example-tab"
                    }
                    role="tab"
                    aria-selected={selectedFileExample === index}
                    onClick={() => setSelectedFileExample(index)}
                  >
                    {example.title}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="file-cards">
            {(exercise.fileExamples[selectedFileExample]?.files ?? []).map((file) => (
              <article className="file-card" key={file.path}>
                <h4>{file.path}</h4>
                <pre>{printable(file.content ?? "")}</pre>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <div className="editor-wrap">
        <Suspense fallback={<div className="editor-loading">Открываем редактор…</div>}>
          <MonacoEditor
            height="330px"
            language="python"
            value={code}
            onChange={(value) => setCode(value ?? "")}
            theme={theme === "dark" ? "vs-dark" : "vs"}
            options={{ minimap: { enabled: false }, fontSize: 15, automaticLayout: true, tabSize: 4 }}
          />
        </Suspense>
      </div>
      <p className="runtime-status">{pythonStatus}</p>
      {saveStatus && <p className="cloud-status" aria-live="polite">{saveStatus}</p>}
      <div className="actions">
        <button type="button" className="button button--secondary" onClick={run} disabled={running}>
          Запустить
        </button>
        <button type="button" className="button" onClick={check} disabled={running}>
          Проверить
        </button>
        <button
          type="button"
          className="link-button"
          ref={solutionButtonRef}
          onClick={revealSolution}
          disabled={solutionVisible}
        >
          {solutionVisible ? "Решение открыто" : "Решение"}
        </button>
      </div>
      {solutionVisible && (
        <pre className="solution">
          <code>{exercise.solution}</code>
        </pre>
      )}
      <Output result={result} judge={judge} />
      {isSolutionDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSolutionDialog();
          }}
        >
          <div
            className="solution-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="solution-dialog-title"
            aria-describedby="solution-dialog-description"
            onKeyDown={handleDialogKeyDown}
          >
            <div className="solution-dialog__icon" aria-hidden="true">
              ?
            </div>
            <h3 id="solution-dialog-title">Показать готовое решение?</h3>
            <p id="solution-dialog-description">
              Сначала попробуйте найти ошибку сами или воспользуйтесь подсказкой. Решение поможет
              разобраться, но лучше сначала сделать ещё одну попытку.
            </p>
            <div className="solution-dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={closeSolutionDialog}
              >
                Отмена
              </button>
              <button type="button" className="button" onClick={confirmRevealSolution}>
                Показать решение
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

type Pane = "navigation" | "theory" | "practice";
type ColumnWidths = { navigation: number; theory: number; practice: number };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

function moveDivider(widths: ColumnWidths, divider: "navigation" | "theory", delta: number) {
  if (divider === "navigation") {
    return {
      ...widths,
      navigation: clamp(widths.navigation + delta, 200, 380),
      theory: clamp(widths.theory - delta, 360, 760)
    };
  }
  return {
    ...widths,
    theory: clamp(widths.theory + delta, 360, 760),
    practice: clamp(widths.practice - delta, 440, 920)
  };
}

function LessonPage({
  content,
  theme,
  onToggleTheme
}: {
  content: LessonContent;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const { lesson, exercises, markdown } = content;
  const exerciseById = useMemo(
    () => new Map(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises]
  );
  const [params, setParams] = useSearchParams();
  const initialId = params.get("exercise") ?? lesson.exerciseOrder[0];
  const [activeId, setActiveId] = useState(
    exerciseById.has(initialId) ? initialId : lesson.exerciseOrder[0]
  );
  const active = exerciseById.get(activeId) ?? exercises[0];
  const [status, setStatus] = useState(() => guestProgress.lessonStatus(lesson.id));
  const [completedExerciseIds, setCompletedExerciseIds] = useState(
    () =>
      new Set(
        exercises.filter((exercise) => guestProgress.isComplete(exercise.id)).map(({ id }) => id)
      )
  );
  useEffect(() => {
    let active = true;
    cloudProgress.load().then((progress) => {
      if (!active) return;
      const cloudLesson = progress.lessons.find((item) => item.lessonId === lesson.id);
      if (cloudLesson?.status === "completed") setStatus("completed");
      setCompletedExerciseIds((current) => {
        const next = new Set(current);
        progress.exercises.filter((item) => item.completed).forEach((item) => next.add(item.exerciseId));
        return next;
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [lesson.id]);
  const [visiblePanes, setVisiblePanes] = useState<Record<Pane, boolean>>({
    navigation: true,
    theory: true,
    practice: true
  });
  const [widths, setWidths] = useState<ColumnWidths>({
    navigation: 240,
    theory: 470,
    practice: 560
  });
  const selectExercise = (id: string) => {
    setActiveId(id);
    setParams({ exercise: id });
  };
  const completeCheckpoint = () => {
    guestProgress.completeLesson(lesson.id);
    setStatus("completed");
  };
  const completeExercise = (exerciseId: string) => {
    setCompletedExerciseIds((current) => new Set(current).add(exerciseId));
  };
  const togglePane = (pane: Pane) => {
    setVisiblePanes((current) => ({ ...current, [pane]: !current[pane] }));
  };
  const resizeDivider = (
    divider: "navigation" | "theory",
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidths = widths;
    const onPointerMove = (moveEvent: PointerEvent) => {
      setWidths(moveDivider(startWidths, divider, moveEvent.clientX - startX));
    };
    const onPointerUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };
  const flexiblePane = (["practice", "theory", "navigation"] as Pane[]).find(
    (pane) => visiblePanes[pane]
  );
  const columnWidth = (pane: Pane, minimum: number) => {
    if (!visiblePanes[pane]) return "0px";
    if (pane === flexiblePane) return `minmax(${minimum}px, 1fr)`;
    return `${widths[pane]}px`;
  };
  const gridStyle = {
    "--navigation-width": columnWidth("navigation", 200),
    "--theory-width": columnWidth("theory", 360),
    "--practice-width": columnWidth("practice", 440),
    "--first-divider": visiblePanes.navigation && visiblePanes.theory ? "10px" : "0px",
    "--second-divider": visiblePanes.theory && visiblePanes.practice ? "10px" : "0px"
  } as CSSProperties;
  const paneLabel: Record<Pane, { title: string; hide: string; show: string }> = {
    navigation: { title: "Разделы", hide: "Скрыть разделы", show: "Показать разделы" },
    theory: { title: "Теория", hide: "Скрыть теорию", show: "Показать теорию" },
    practice: { title: "Практика", hide: "Скрыть практику", show: "Показать практику" }
  };
  return (
    <main className="lesson-layout">
      <header className="topbar">
        <Link to="/" className="brand brand--topbar">
          IT-ПАРК <span>Python</span>
        </Link>
        <div className="topbar-controls" aria-label="Настройка рабочего пространства">
          {(Object.keys(paneLabel) as Pane[]).map((pane) => (
            <button
              type="button"
              key={pane}
              className={visiblePanes[pane] ? "menu-button menu-button--active" : "menu-button"}
              onClick={() => togglePane(pane)}
              aria-pressed={visiblePanes[pane]}
            >
              {visiblePanes[pane] ? paneLabel[pane].hide : paneLabel[pane].show}
            </button>
          ))}
          <button className="menu-button theme-toggle" type="button" onClick={onToggleTheme}>
            {theme === "light" ? "Тёмная тема" : "Светлая тема"}
          </button>
        </div>
      </header>
      <div className="lesson-grid" style={gridStyle}>
        {visiblePanes.navigation && (
          <aside className="course-nav">
            <div className="panel-heading">
              <span>Разделы</span>
              <button
                type="button"
                className="collapse-button"
                onClick={() => togglePane("navigation")}
              >
                Скрыть
              </button>
            </div>
            <p className="eyebrow">Раздел</p>
            {[...new Set(courseEntries.map((item) => item.sectionTitle))].map((sectionTitle) => (
              <div className="course-nav-section" key={sectionTitle}>
                <h2>{sectionTitle}</h2>
                {courseEntries.filter((item) => item.sectionTitle === sectionTitle).map((item) => (
                  <Link
                    key={item.lesson.id}
                    className={
                      item.lesson.id === lesson.id
                        ? "lesson-link lesson-link--current"
                        : "lesson-link"
                    }
                    to={item.path}
                  >
                    {guestProgress.lessonStatus(item.lesson.id) === "completed" ? "✓ " : "○ "}
                    {item.lesson.title}
                  </Link>
                ))}
              </div>
            ))}
            <p className="progress-line">
              Статус урока:{" "}
              {status === "completed"
                ? "пройден"
                : status === "in_progress"
                  ? "в процессе"
                  : "не начат"}
            </p>
          </aside>
        )}
        {visiblePanes.navigation && visiblePanes.theory && (
          <div
            className="resize-handle resize-handle--navigation"
            role="separator"
            aria-label="Изменить ширину разделов и теории"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={(event) => resizeDivider("navigation", event)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                setWidths((current) =>
                  moveDivider(current, "navigation", event.key === "ArrowLeft" ? -24 : 24)
                );
              }
            }}
          />
        )}
        {visiblePanes.theory && (
          <article className="theory">
            <div className="panel-heading">
              <span>Теория</span>
              <button
                type="button"
                className="collapse-button"
                onClick={() => togglePane("theory")}
              >
                Скрыть
              </button>
            </div>
            <p className="eyebrow">Python для школьников</p>
            <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeMarkdownUrl}>{markdown}</ReactMarkdown>
          </article>
        )}
        {visiblePanes.theory && visiblePanes.practice && (
          <div
            className="resize-handle resize-handle--theory"
            role="separator"
            aria-label="Изменить ширину теории и практики"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={(event) => resizeDivider("theory", event)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                setWidths((current) =>
                  moveDivider(current, "theory", event.key === "ArrowLeft" ? -24 : 24)
                );
              }
            }}
          />
        )}
        {visiblePanes.practice && (
          <div className="practice-pane">
            <div className="panel-heading">
              <span>Практика</span>
              <button
                type="button"
                className="collapse-button"
                onClick={() => togglePane("practice")}
              >
                Скрыть
              </button>
            </div>
            <nav className="exercise-tabs" aria-label="Упражнения урока">
              {exercises.map((exercise, index) => {
                const isActive = activeId === exercise.id;
                const isCompleted = completedExerciseIds.has(exercise.id);
                const title = exercise.kind === "checkpoint" ? "Контрольная" : exercise.title;
                return (
                  <button
                    type="button"
                    key={exercise.id}
                    className={`tab${isActive ? " tab--active" : ""}${
                      isCompleted ? " tab--completed" : ""
                    }`}
                    aria-current={isActive ? "step" : undefined}
                    aria-label={isCompleted ? `${title} — выполнено` : title}
                    onClick={() => selectExercise(exercise.id)}
                  >
                    {index + 1}. {title}
                    {isCompleted && (
                      <span className="tab-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <ExerciseWorkspace
              exercise={active}
              lessonId={lesson.id}
              theme={theme}
              onCheckpoint={completeCheckpoint}
              onCompleted={completeExercise}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function Home({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  return (
    <>
      <header className="topbar topbar--home">
        <Link to="/" className="brand brand--topbar">
          IT-ПАРК <span>Python</span>
        </Link>
        <div className="topbar-controls">
          <Link className="menu-button" to="/teacher/groups">Кабинет преподавателя</Link>
          <Link className="menu-button" to="/admin">Админ-панель</Link>
          <button className="menu-button theme-toggle" type="button" onClick={onToggleTheme}>
            {theme === "light" ? "Тёмная тема" : "Светлая тема"}
          </button>
        </div>
      </header>
      <main className="home home--landing">
        <section className="home-hero" aria-labelledby="home-title">
          <p className="eyebrow">Интерактивный курс IT-ПАРКА</p>
          <h1 id="home-title">Python: от первой программы до алгоритмов</h1>
          <p className="home-lead">
            Это курс программирования для школьников: разбирайте алгоритмы, пишите код,
            проверяйте себя и находите ошибки прямо в браузере.
          </p>
          <div className="home-actions">
            <Link className="button home-start" to="/python/basics/input-output">
              Начать изучение <span aria-hidden="true">→</span>
            </Link>
          </div>
          <p className="home-note">Начнём с ввода, вывода и первых переменных. Аккаунт не нужен, чтобы попробовать урок.</p>
        </section>
        <section className="home-principles" aria-label="Как устроено обучение">
          <article>
            <span aria-hidden="true">01</span>
            <h2>Понимайте</h2>
            <p>
              Короткая теория и примеры объясняют не только как написать код, но и почему он
              работает.
            </p>
          </article>
          <article>
            <span aria-hidden="true">02</span>
            <h2>Пробуйте</h2>
            <p>
              Решайте задачи в редакторе, запускайте программы и разбирайте результат каждого теста.
            </p>
          </article>
          <article>
            <span aria-hidden="true">03</span>
            <h2>Закрепляйте</h2>
            <p>
              Контрольная задача помогает перенести навык в новую ситуацию, а прогресс сохраняется.
            </p>
          </article>
        </section>
        <section className="home-overview" aria-label="О курсе">
          <article className="education-card">
            <p className="eyebrow">Как заниматься</p>
            <h2>Один урок — один понятный цикл</h2>
            <ol>
              <li>Прочитайте короткое объяснение и разберите пример.</li>
              <li>Решите задачи в редакторе и посмотрите протокол тестов.</li>
              <li>Закрепите навык контрольной задачей или практикумом.</li>
            </ol>
          </article>
          <article className="education-card">
            <p className="eyebrow">Что изучаем</p>
            <h2>Школьная информатика через Python</h2>
            <p>Переменные, ветвления, циклы, строки, списки, функции, файлы, алгоритмы, графы и динамическое программирование.</p>
            <p>Курс помогает освоить программирование и алгоритмическое мышление; это не тренажёр конкретного экзамена.</p>
          </article>
          <article className="education-card education-card--accent">
            <p className="eyebrow">Практикумы</p>
            <h2>Большие серии задач</h2>
            <p>После ключевых блоков есть практикумы: в них задачи идут от простой к составной и проверяются прямо в браузере.</p>
            <Link className="text-link" to="/python/practicums/first-programs">Открыть первый практикум →</Link>
          </article>
        </section>
        <section className="itpark-panel" aria-label="Об IT-ПАРКЕ">
          <div>
            <p className="eyebrow">IT-ПАРК</p>
            <h2>Образовательная среда для тех, кто хочет создавать</h2>
            <p>Курс подготовлен IT-ПАРКОМ. Здесь можно учиться самостоятельно, а затем продолжить путь в проектах и занятиях сообщества.</p>
          </div>
          <div className="itpark-links">
            <a href="https://itpark32.ru/" target="_blank" rel="noreferrer">Сайт IT-ПАРКА</a>
            <a href="https://vk.ru/itpark32" target="_blank" rel="noreferrer">IT-ПАРК во ВКонтакте</a>
            <a href="https://t.me/itpark32" target="_blank" rel="noreferrer">IT-ПАРК в Telegram</a>
          </div>
        </section>
      </main>
    </>
  );
}

function LessonRoute({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const { sectionId, slug } = useParams();
  const path = `/python/${sectionId}/${slug}`;
  const [content, setContent] = useState<LessonContent | null>(null);
  useEffect(() => {
    let live = true;
    setContent(null);
    loadLessonContent(path).then((next) => { if (live) setContent(next ?? null); }).catch(() => { if (live) setContent(null); });
    return () => { live = false; };
  }, [path]);
  if (!content) return <main className="lesson-loading" aria-live="polite">Загружаем урок…</main>;
  return <LessonPage key={content.lesson.id} content={content} theme={theme} onToggleTheme={onToggleTheme} />;
}

function ProgressMigration() {
  const [open, setOpen] = useState(false);
  const [conflicts, setConflicts] = useState<{ exerciseId: string; localCode: string; cloudCode: string }[]>([]);
  const [choices, setChoices] = useState<Record<string, "local" | "cloud">>({});
  const [message, setMessage] = useState("");
  const snapshot = guestProgress.snapshot();
  const payload = () => ({
    exercises: Object.keys(snapshot.codes).map((exerciseId) => ({ exerciseId, code: snapshot.codes[exerciseId], stdin: snapshot.stdin[exerciseId], completed: Boolean(snapshot.exercises[exerciseId]), solutionRevealed: Boolean(snapshot.solutions[exerciseId]) })),
    lessons: Object.keys(snapshot.lessons).map((lessonId) => ({ lessonId, status: snapshot.lessons[lessonId] })),
    codeResolutions: choices
  });
  useEffect(() => {
    const checkForMigration = () => {
      const hasLocal = Object.keys(snapshot.codes).length + Object.keys(snapshot.exercises).length + Object.keys(snapshot.lessons).length > 0;
      if (!hasLocal || localStorage.getItem("pbook:guest-progress:cloud-imported")) return;
      cloudProgress.load().then(() => setOpen(true)).catch(() => undefined);
    };
    checkForMigration();
    window.addEventListener("pbook:auth-ready", checkForMigration);
    return () => window.removeEventListener("pbook:auth-ready", checkForMigration);
  // Local snapshot is read once when the app mounts; rerenders must not reopen the prompt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const transfer = () => {
    setMessage("");
    cloudProgress.import(payload()).then(() => { localStorage.setItem("pbook:guest-progress:cloud-imported", "true"); setOpen(false); }).catch((reason) => {
      const found = (reason as { conflicts?: { exerciseId: string; localCode: string; cloudCode: string }[] }).conflicts ?? [];
      if (found.length) setConflicts(found); else setMessage("Не удалось перенести прогресс. Попробуйте позже.");
    });
  };
  if (!open) return null;
  const unresolved = conflicts.some((item) => !choices[item.exerciseId]);
  return <div className="modal-backdrop"><section className="solution-dialog progress-migration" role="dialog" aria-modal="true"><p className="eyebrow">Прогресс на устройстве</p><h2>Мы нашли ваш прогресс</h2>{conflicts.length === 0 ? <p>Перенести решения и завершённые задания в аккаунт?</p> : <><p>Код отличается между устройством и аккаунтом. Выберите версию для каждого упражнения.</p>{conflicts.map((item) => <div className="migration-conflict" key={item.exerciseId}><strong>{item.exerciseId}</strong><div><button className={choices[item.exerciseId] === "cloud" ? "button" : "button button--secondary"} onClick={() => setChoices({ ...choices, [item.exerciseId]: "cloud" })}>Сохранить облачную версию</button><button className={choices[item.exerciseId] === "local" ? "button" : "button button--secondary"} onClick={() => setChoices({ ...choices, [item.exerciseId]: "local" })}>Сохранить локальную версию</button></div></div>)}</>}{message && <p className="invite-notice invite-notice--error">{message}</p>}<div className="solution-dialog__actions"><button className="button button--secondary" onClick={() => setOpen(false)}>Пока не сейчас</button><button className="button" disabled={unresolved} onClick={transfer}>{conflicts.length ? "Перенести выбранные версии" : "Перенести"}</button></div></section></div>;
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(
    () =>
      guestProgress.getTheme() ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    guestProgress.setTheme(next);
    setTheme(next);
  };
  return (
    <><ProgressMigration /><Routes>
      <Route path="/" element={<Home theme={theme} onToggleTheme={toggleTheme} />} />
      <Route path="/invite/:token" element={<InvitePage theme={theme} onToggleTheme={toggleTheme} />} />
      <Route path="/teacher/groups" element={<TeacherGroupsPage theme={theme} onToggleTheme={toggleTheme} />} />
      <Route path="/admin" element={<AdminPage theme={theme} onToggleTheme={toggleTheme} />} />
      <Route path="/python/:sectionId/:slug" element={<LessonRoute theme={theme} onToggleTheme={toggleTheme} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></>
  );
}
