const KEY = "pbook:guest-progress:v1";

type GuestProgress = {
  codes: Record<string, string>;
  stdin: Record<string, string>;
  exercises: Record<string, boolean>;
  lessons: Record<string, "not_started" | "in_progress" | "completed">;
  solutions: Record<string, boolean>;
  theme?: "light" | "dark";
};

const empty = (): GuestProgress => ({
  codes: {},
  stdin: {},
  exercises: {},
  lessons: {},
  solutions: {}
});

function read(): GuestProgress {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return empty();
  }
}

function write(progress: GuestProgress) {
  localStorage.setItem(KEY, JSON.stringify(progress));
}

export const guestProgress = {
  snapshot: () => read(),
  getCode: (id: string, fallback: string) => read().codes[id] ?? fallback,
  setCode: (id: string, code: string, lessonId: string) => {
    const progress = read();
    progress.codes[id] = code;
    progress.lessons[lessonId] ||= "in_progress";
    write(progress);
  },
  getStdin: (id: string) => read().stdin[id] ?? "",
  setStdin: (id: string, stdin: string) => {
    const progress = read();
    progress.stdin[id] = stdin;
    write(progress);
  },
  completeExercise: (id: string) => {
    const progress = read();
    progress.exercises[id] = true;
    write(progress);
  },
  completeLesson: (id: string) => {
    const progress = read();
    progress.lessons[id] = "completed";
    write(progress);
  },
  isComplete: (id: string) => Boolean(read().exercises[id]),
  lessonStatus: (id: string) => read().lessons[id] ?? "not_started",
  solutionRevealed: (id: string) => Boolean(read().solutions[id]),
  revealSolution: (id: string) => {
    const progress = read();
    progress.solutions[id] = true;
    write(progress);
  },
  getTheme: () => read().theme,
  setTheme: (theme: "light" | "dark") => {
    const progress = read();
    progress.theme = theme;
    write(progress);
  }
};
