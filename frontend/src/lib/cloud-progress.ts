export type CloudExercise = { exerciseId: string; completed: boolean; code?: string; stdin?: string; solutionRevealed: boolean };
export type CloudProgress = { exercises: CloudExercise[]; lessons: { lessonId: string; status: string }[] };

async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...options, headers: { ...(options?.body ? { "Content-Type": "application/json" } : {}), ...options?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw body;
  return body as T;
}

export const cloudProgress = {
  load: () => call<CloudProgress>("/api/v1/progress"),
  save: (exerciseId: string, value: { code: string; stdin: string; solutionRevealed: boolean }) => call(`/api/v1/progress/exercises/${encodeURIComponent(exerciseId)}`, { method: "PUT", body: JSON.stringify(value) }),
  attempt: (exerciseId: string, value: { passed: boolean; passedTests: number; totalTests: number; lessonId: string; checkpoint: boolean }) => call(`/api/v1/progress/exercises/${encodeURIComponent(exerciseId)}/attempt`, { method: "POST", body: JSON.stringify(value) }),
  saveLesson: (lessonId: string, status: "in_progress" | "completed") => call(`/api/v1/progress/lessons/${encodeURIComponent(lessonId)}`, { method: "PUT", body: JSON.stringify({ status }) }),
  import: (value: unknown) => call("/api/v1/progress/import", { method: "POST", body: JSON.stringify(value) })
};
