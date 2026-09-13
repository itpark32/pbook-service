import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { courseEntries, exerciseTitleById } from "./content";
import { withCount } from "./lib/russian";

type Member = { id: number; fullName?: string; email: string; classOrGroup?: string };
type Group = { id: number; name: string; memberCount: number; members: Member[] };
type Account = { email: string; role: string };
type Practicum = { id: string; title: string; completed: number; total: number };
type Student = {
  id: number; fullName?: string; email: string; birthYear?: number; city?: string;
  institutionName?: string; classOrGroup?: string; completedLessons: number;
  completedExercises: number; practicums: Practicum[];
};
type StudentCard = {
  student: Student; course: { totalLessons: number; totalExercises: number };
  lessons: { lessonId: string; status: string }[];
  exercises: { exerciseId: string; completed: boolean; attemptsCount: number }[];
};
type ExerciseProgress = {
  exerciseId: string; completed: boolean; attemptsCount: number; passedTests?: number;
  totalTests?: number; code?: string; stdin?: string; solutionRevealed: boolean;
};

const exerciseTitles = exerciseTitleById;

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options?.body ? { "Content-Type": "application/json" } : {}), ...options?.headers }
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Не удалось выполнить запрос.");
  return body;
}

function studentName(student: Pick<Student, "fullName" | "email">) {
  return student.fullName || student.email;
}

export function TeacherGroupsPage({
  theme,
  onToggleTheme
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const [account, setAccount] = useState<Account | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [card, setCard] = useState<StudentCard | null>(null);
  const [exercise, setExercise] = useState<ExerciseProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [removing, setRemoving] = useState<{ groupID: number; userID: number } | null>(null);
  const [inviteURLs, setInviteURLs] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const me = await api<{ user: Account }>("/api/v1/auth/me");
    setAccount(me.user);
    const result = await api<{ groups: Group[] }>("/api/v1/groups");
    setGroups(result.groups);
  };
  useEffect(() => {
    load()
      .catch((reason: Error) => {
        if (reason.message !== "Нужно войти в аккаунт.") setError(reason.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const run = async (operation: () => Promise<void>) => {
    setError(""); setNotice(""); setBusy(true);
    try { await operation(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить изменения."); }
    finally { setBusy(false); }
  };
  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    run(async () => { await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify(login) }); await load(); });
  };
  const createGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    run(async () => { await api("/api/v1/groups", { method: "POST", body: JSON.stringify({ name: newName }) }); setNewName(""); await load(); setNotice("Группа создана."); });
  };
  const renameGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    run(async () => { await api(`/api/v1/groups/${editing.id}`, { method: "PATCH", body: JSON.stringify({ name: editing.name }) }); setEditing(null); await load(); setNotice("Название группы обновлено."); });
  };
  const regenerateInvite = (groupID: number) => run(async () => {
    const result = await api<{ url: string }>(`/api/v1/groups/${groupID}/student-invite`, { method: "POST", body: "{}" });
    setInviteURLs((current) => ({ ...current, [groupID]: result.url }));
    setNotice("Новая ссылка создана; предыдущая больше не действует.");
  });
  const removeMember = () => {
    if (!removing) return;
    run(async () => { await api(`/api/v1/groups/${removing.groupID}/members/${removing.userID}`, { method: "DELETE" }); setRemoving(null); await load(); setNotice("Ученик удалён из группы. Его аккаунт и прогресс сохранены."); });
  };
  const deleteGroup = () => {
    if (!deleting) return;
    run(async () => { await api(`/api/v1/groups/${deleting}`, { method: "DELETE" }); setDeleting(null); await load(); setNotice("Группа и её активная ссылка удалены. Аккаунты учеников сохранены."); });
  };
  const openGroup = (group: Group) => run(async () => {
    const result = await api<{ students: Student[] }>(`/api/v1/teacher/groups/${group.id}/students`);
    setSelectedGroup(group); setStudents(result.students); setCard(null); setExercise(null);
  });
  const openStudent = (student: Student) => run(async () => {
    const result = await api<StudentCard>(`/api/v1/teacher/students/${student.id}`);
    setCard(result); setExercise(null);
  });
  const openExercise = (exerciseID: string) => {
    if (!card) return;
    run(async () => {
      const result = await api<{ progress: ExerciseProgress }>(`/api/v1/teacher/students/${card.student.id}/exercises/${encodeURIComponent(exerciseID)}`);
      setExercise(result.progress);
    });
  };
  const backToGroups = () => { setSelectedGroup(null); setCard(null); setExercise(null); };
  const backToStudents = () => { setCard(null); setExercise(null); };

  const header = <header className="topbar topbar--home"><Link to="/" className="brand brand--topbar">IT-ПАРК <span>Python</span></Link><div className="topbar-controls"><Link className="menu-button" to="/">К курсу</Link><button className="menu-button theme-toggle" type="button" onClick={onToggleTheme}>{theme === "light" ? "Тёмная тема" : "Светлая тема"}</button></div></header>;
  if (card) {
    const statuses = new Map(card.lessons.map((item) => [item.lessonId, item.status]));
  return <main className="teacher-page">{header}<section className="teacher-shell teacher-card" aria-live="polite"><button className="link-button" onClick={backToStudents}>← К ученикам группы</button><p className="eyebrow">Карточка ученика</p><h1>{studentName(card.student)}</h1><p className="student-facts">{card.student.birthYear ? `${card.student.birthYear} г.р.` : "Год рождения не указан"} · {card.student.city ?? "Город не указан"}<br />{card.student.institutionName ?? "Учебное заведение не указано"}{card.student.classOrGroup ? ` · ${card.student.classOrGroup}` : ""}<br /><a href={`mailto:${card.student.email}`}>{card.student.email}</a></p>{error && <p className="invite-notice invite-notice--error">{error}</p>}<div className="student-stat-grid"><article><span>Курс</span><strong>{card.student.completedLessons} / {card.course.totalLessons} уроков</strong></article><article><span>Практика</span><strong>{card.student.completedExercises} / {card.course.totalExercises} задач</strong></article></div><section className="student-progress-list"><h2>По урокам</h2>{courseEntries.filter((content) => !content.isPracticum).map((content) => { const status = statuses.get(content.lesson.id) ?? "not_started"; return <div className="lesson-progress-row" key={content.lesson.id}><span aria-hidden="true">{status === "completed" ? "✓" : status === "in_progress" ? "↻" : "○"}</span><strong>{content.lesson.title}</strong><small>{status === "completed" ? "пройден" : status === "in_progress" ? "в процессе" : "не начат"}</small></div>; })}</section><section className="student-progress-list"><h2>Практикумы</h2>{card.student.practicums.map((practicum) => <div className="lesson-progress-row" key={practicum.id}><span aria-hidden="true">◈</span><strong>{practicum.title}</strong><small>{practicum.completed} / {practicum.total} решено</small></div>)}</section><section className="student-progress-list"><h2>Сохранённые упражнения</h2><p className="muted">Можно открыть последнюю версию кода ученика. Доступ только для участников ваших групп.</p>{card.exercises.length === 0 ? <p className="muted">Ученик пока не сохранял прогресс.</p> : card.exercises.map((item) => <div className="lesson-progress-row" key={item.exerciseId}><strong>{exerciseTitles.get(item.exerciseId) ?? item.exerciseId}</strong><small>{item.completed ? "выполнено" : "в процессе"} · попыток: {item.attemptsCount}</small><button className="button button--secondary" type="button" onClick={() => openExercise(item.exerciseId)} disabled={busy}>Открыть код</button></div>)}</section>{exercise && <section className="student-code"><div><h2>Последний сохранённый код</h2><p>{exercise.completed ? "Задание выполнено" : "Задание ещё не выполнено"} · попыток: {exercise.attemptsCount}</p></div>{exercise.code ? <pre><code>{exercise.code}</code></pre> : <p className="muted">Код для этого упражнения ещё не сохранён.</p>}{exercise.stdin !== undefined && <><h3>Входные данные</h3><pre><code>{exercise.stdin || "(пусто)"}</code></pre></>}</section>}</section></main>;
  }
  if (selectedGroup) {
    return <main className="teacher-page">{header}<section className="teacher-shell" aria-live="polite"><button className="link-button" onClick={backToGroups}>← Ко всем группам</button><p className="eyebrow">Группа</p><h1>{selectedGroup.name}</h1><p className="muted">{withCount(students.length, ["ученик", "ученика", "учеников"])}</p>{error && <p className="invite-notice invite-notice--error">{error}</p>}<div className="student-list">{students.length === 0 ? <p className="teacher-empty">В группе пока нет учеников. Создайте приглашение и отправьте ссылку группе.</p> : students.map((student) => <article className="student-row" key={student.id}><div><h2>{studentName(student)}</h2><p>{student.birthYear ? `${student.birthYear} г.р. · ` : ""}{student.city ?? "Город не указан"}<br />{student.institutionName ?? "Учебное заведение не указано"}{student.classOrGroup ? ` · ${student.classOrGroup}` : ""}</p><div className="student-row__metrics"><span>{withCount(student.completedLessons, ["урок пройден", "урока пройдено", "уроков пройдено"])}</span><span>{withCount(student.completedExercises, ["задача решена", "задачи решено", "задач решено"])}</span>{student.practicums.map((practicum) => <span key={practicum.id}>{practicum.completed} из {practicum.total} задач решено</span>)}</div></div><button className="button" type="button" disabled={busy} onClick={() => openStudent(student)}>Открыть карточку</button></article>)}</div></section></main>;
  }
  return <main className="teacher-page">{header}<section className="teacher-shell" aria-live="polite"><p className="eyebrow">Кабинет преподавателя</p><h1>Мои группы</h1>{loading && <p className="muted">Загружаем группы…</p>}{!loading && !account && <form className="teacher-login" onSubmit={submitLogin}><h2>Войдите как преподаватель</h2><p>После входа здесь появятся только ваши группы.</p><label className="invite-field"><span>Email</span><input type="email" required value={login.email} onChange={(event) => setLogin((value) => ({ ...value, email: event.target.value }))} /></label><label className="invite-field"><span>Пароль</span><input type="password" required value={login.password} onChange={(event) => setLogin((value) => ({ ...value, password: event.target.value }))} /></label><button className="button" disabled={busy}>{busy ? "Входим…" : "Войти"}</button></form>}{!loading && account && <>{error && <p className="invite-notice invite-notice--error">{error}</p>}{notice && <p className="invite-notice invite-notice--success">{notice}</p>}<form className="group-create" onSubmit={createGroup}><label className="invite-field"><span>Новая группа</span><input required maxLength={160} value={newName} placeholder="Например, Python 9А" onChange={(event) => setNewName(event.target.value)} /></label><button className="button" disabled={busy}>{busy ? "Сохраняем…" : "Создать группу"}</button></form><div className="group-list">{groups.length === 0 && <p className="teacher-empty">Групп пока нет. Создайте первую — затем появится ссылка для учеников.</p>}{groups.map((group) => <article className="group-card" key={group.id}>{editing?.id === group.id ? <form className="group-rename" onSubmit={renameGroup}><input aria-label="Название группы" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /><button className="button" disabled={busy}>Сохранить</button><button type="button" className="button button--secondary" onClick={() => setEditing(null)}>Отмена</button></form> : <div className="group-card-heading"><div><h2>{group.name}</h2><p>{group.memberCount} {group.memberCount === 1 ? "ученик" : "учеников"}</p></div><button type="button" className="link-button" onClick={() => setEditing({ id: group.id, name: group.name })}>Переименовать</button></div>}<div className="group-actions"><button type="button" className="button" disabled={busy} onClick={() => openGroup(group)}>Открыть учеников</button><button type="button" className="button button--secondary" disabled={busy} onClick={() => regenerateInvite(group.id)}>Создать новую ссылку</button><button type="button" className="link-button group-delete" onClick={() => setDeleting(group.id)}>Удалить группу</button></div>{inviteURLs[group.id] && <label className="group-link"><span>Ссылка для учеников — скопируйте и отправьте:</span><input readOnly value={inviteURLs[group.id]} onFocus={(event) => event.currentTarget.select()} /></label>}<section className="member-list" aria-label={`Участники группы ${group.name}`}><h3>Участники</h3>{group.members.length === 0 ? <p className="muted">Пока никто не присоединился.</p> : group.members.map((member) => <div className="member-row" key={member.id}><div><strong>{member.fullName ?? member.email}</strong><span>{member.email}{member.classOrGroup ? ` · ${member.classOrGroup}` : ""}</span></div><button type="button" className="link-button group-delete" onClick={() => setRemoving({ groupID: group.id, userID: member.id })}>Удалить из группы</button></div>)}</section></article>)}</div></>}</section>{deleting !== null && <section className="confirm-strip" role="dialog" aria-modal="true" aria-label="Удаление группы"><p>Удалить группу? Участники потеряют membership, но их аккаунты и прогресс останутся.</p><button className="button" disabled={busy} onClick={deleteGroup}>Удалить</button><button className="button button--secondary" onClick={() => setDeleting(null)}>Отмена</button></section>}{removing && <section className="confirm-strip" role="dialog" aria-modal="true" aria-label="Удаление участника"><p>Удалить ученика из этой группы? Его аккаунт и прогресс сохранятся.</p><button className="button" disabled={busy} onClick={removeMember}>Удалить из группы</button><button className="button button--secondary" onClick={() => setRemoving(null)}>Отмена</button></section>}</main>;
}
