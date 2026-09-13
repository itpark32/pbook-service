import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";

type Account = { id: number; email: string; role: string };
type User = {
  id: number; email: string; fullName?: string; role: "student" | "teacher" | "admin";
  status: "active" | "blocked"; birthYear?: number; city?: string;
  institutionName?: string; institutionType?: string; classOrGroup?: string;
};
type Invite = {
  id: number; type: "teacher" | "student"; creatorName?: string; creatorEmail: string;
  groupName?: string; createdAt: string; expiresAt?: string; usedAt?: string; revokedAt?: string;
};
type TreeNode = { id: number; fullName?: string; email: string; role: string; status: string; children: TreeNode[] };
type Filters = { query: string; role: string; status: string; city: string; institutionType: string; institutionName: string; birthYear: string };

const emptyFilters: Filters = { query: "", role: "", status: "", city: "", institutionType: "", institutionName: "", birthYear: "" };

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...options, headers: { ...(options?.body ? { "Content-Type": "application/json" } : {}), ...options?.headers } });
  const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Не удалось выполнить запрос.");
  return body;
}

function displayName(value: { fullName?: string; email: string }) { return value.fullName || value.email; }
function dateTime(value?: string) { return value ? new Date(value).toLocaleString("ru-RU") : "—"; }

function Tree({ nodes }: { nodes: TreeNode[] }) {
  if (!nodes.length) return <p className="muted">Преподавателей пока нет.</p>;
  return <ul className="admin-tree">{nodes.map((node) => <li key={node.id}><div><strong>{displayName(node)}</strong><span>{node.role === "admin" ? "Администратор" : "Преподаватель"} · {node.status === "active" ? "активен" : "заблокирован"}</span></div><Tree nodes={node.children} /></li>)}</ul>;
}

export function AdminPage({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [tab, setTab] = useState<"users" | "invites" | "tree">("users");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingStatus, setPendingStatus] = useState<User | null>(null);
  const [teacherInviteURL, setTeacherInviteURL] = useState("");

  const loadUsers = async (nextFilters = filters) => {
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
    const result = await api<{ users: User[] }>(`/api/v1/admin/users${params.size ? `?${params}` : ""}`);
    setUsers(result.users);
  };
  const loadAll = async () => {
    const me = await api<{ user: Account }>("/api/v1/auth/me");
    if (me.user.role !== "admin") throw new Error("Раздел доступен только администратору.");
    setAccount(me.user);
    const [userResult, inviteResult, treeResult] = await Promise.all([
      api<{ users: User[] }>("/api/v1/admin/users"), api<{ invites: Invite[] }>("/api/v1/admin/invites"), api<{ tree: TreeNode[] }>("/api/v1/admin/teacher-tree")
    ]);
    setUsers(userResult.users); setInvites(inviteResult.invites); setTree(treeResult.tree);
  };
  useEffect(() => { loadAll().catch((reason: Error) => { if (reason.message !== "Нужно войти в аккаунт.") setError(reason.message); }).finally(() => setLoading(false)); }, []);
  const run = async (operation: () => Promise<void>) => { setError(""); setNotice(""); setBusy(true); try { await operation(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить изменения."); } finally { setBusy(false); } };
  const submitLogin = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); run(async () => { await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify(login) }); await loadAll(); }); };
  const applyFilters = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); run(async () => { await loadUsers(); setNotice("Фильтры применены."); }); };
  const changeStatus = () => {
    if (!pendingStatus) return;
    const next = pendingStatus.status === "active" ? "blocked" : "active";
    run(async () => { await api(`/api/v1/admin/users/${pendingStatus.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) }); setPendingStatus(null); await Promise.all([loadUsers(), loadAllTree()]); setNotice(next === "blocked" ? "Аккаунт заблокирован, его сессии закрыты, инвайты отключены." : "Аккаунт разблокирован. Для входа потребуется новая сессия."); });
  };
  const loadAllTree = async () => { const result = await api<{ tree: TreeNode[] }>("/api/v1/admin/teacher-tree"); setTree(result.tree); };
  const createTeacherInvite = () => run(async () => { const result = await api<{ url: string }>("/api/v1/invites/teacher", { method: "POST", body: "{}" }); setTeacherInviteURL(result.url); const resultInvites = await api<{ invites: Invite[] }>("/api/v1/admin/invites"); setInvites(resultInvites.invites); setNotice("Одноразовое приглашение преподавателю создано."); });
  const revokeInvite = (id: number) => run(async () => { await api(`/api/v1/admin/invites/${id}/revoke`, { method: "POST", body: "{}" }); const result = await api<{ invites: Invite[] }>("/api/v1/admin/invites"); setInvites(result.invites); setNotice("Приглашение отозвано."); });
  const header = <header className="topbar topbar--home"><Link to="/" className="brand brand--topbar">IT-ПАРК <span>Python</span></Link><div className="topbar-controls"><Link className="menu-button" to="/teacher/groups">Кабинет преподавателя</Link><button className="menu-button theme-toggle" type="button" onClick={onToggleTheme}>{theme === "light" ? "Тёмная тема" : "Светлая тема"}</button></div></header>;

  return <main className="admin-page">{header}<section className="admin-shell" aria-live="polite"><p className="eyebrow">Управление платформой</p><h1>Админ-панель</h1>{loading && <p className="muted">Загружаем данные…</p>}{!loading && !account && <form className="teacher-login" onSubmit={submitLogin}><h2>Войдите как администратор</h2><p>Доступ к пользователям и приглашениям есть только у bootstrap-администратора.</p><label className="invite-field"><span>Email</span><input type="email" required value={login.email} onChange={(event) => setLogin((current) => ({ ...current, email: event.target.value }))} /></label><label className="invite-field"><span>Пароль</span><input type="password" required value={login.password} onChange={(event) => setLogin((current) => ({ ...current, password: event.target.value }))} /></label><button className="button" disabled={busy}>{busy ? "Входим…" : "Войти"}</button></form>}{!loading && account && <>{error && <p className="invite-notice invite-notice--error">{error}</p>}{notice && <p className="invite-notice invite-notice--success">{notice}</p>}<nav className="admin-tabs" aria-label="Разделы админ-панели"><button className={tab === "users" ? "menu-button menu-button--active" : "menu-button"} onClick={() => setTab("users")}>Пользователи</button><button className={tab === "invites" ? "menu-button menu-button--active" : "menu-button"} onClick={() => setTab("invites")}>Приглашения</button><button className={tab === "tree" ? "menu-button menu-button--active" : "menu-button"} onClick={() => setTab("tree")}>Дерево преподавателей</button></nav>{tab === "users" && <><form className="admin-filters" onSubmit={applyFilters}><label><span>ФИО или email</span><input value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} /></label><label><span>Роль</span><select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}><option value="">Все</option><option value="student">Ученик</option><option value="teacher">Преподаватель</option><option value="admin">Администратор</option></select></label><label><span>Статус</span><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Все</option><option value="active">Активен</option><option value="blocked">Заблокирован</option></select></label><label><span>Город</span><input value={filters.city} onChange={(event) => setFilters({ ...filters, city: event.target.value })} /></label><label><span>Тип организации</span><select value={filters.institutionType} onChange={(event) => setFilters({ ...filters, institutionType: event.target.value })}><option value="">Все</option><option value="school">Школа</option><option value="college">Колледж</option><option value="university">ВУЗ</option><option value="public_supplementary">Гос. доп. образование</option><option value="private_supplementary">Частное доп. образование</option><option value="tutor">Репетитор</option><option value="self_study">Самообучение</option><option value="other">Другое</option></select></label><label><span>Организация</span><input value={filters.institutionName} onChange={(event) => setFilters({ ...filters, institutionName: event.target.value })} /></label><label><span>Год рождения</span><input inputMode="numeric" value={filters.birthYear} onChange={(event) => setFilters({ ...filters, birthYear: event.target.value })} /></label><button className="button" disabled={busy}>Применить</button></form><div className="admin-users">{users.length === 0 ? <p className="teacher-empty">Пользователи не найдены.</p> : users.map((user) => <article className="admin-user-row" key={user.id}><div><h2>{displayName(user)}</h2><p>{user.email} · {user.role === "student" ? "ученик" : user.role === "teacher" ? "преподаватель" : "администратор"}</p><small>{user.city ?? "Город не указан"}{user.institutionName ? ` · ${user.institutionName}` : ""}{user.birthYear ? ` · ${user.birthYear} г.р.` : ""}</small></div><div className="admin-user-row__actions"><span className={user.status === "active" ? "status-pill" : "status-pill status-pill--blocked"}>{user.status === "active" ? "Активен" : "Заблокирован"}</span>{user.id !== account.id && <button className={user.status === "active" ? "link-button group-delete" : "link-button"} type="button" disabled={busy} onClick={() => setPendingStatus(user)}>{user.status === "active" ? "Заблокировать" : "Разблокировать"}</button>}</div></article>)}</div></>}{tab === "invites" && <><section className="admin-invite-create"><div><h2>Приглашение преподавателю</h2><p>Одноразовая ссылка действует семь дней.</p></div><button className="button" type="button" disabled={busy} onClick={createTeacherInvite}>Создать ссылку</button></section>{teacherInviteURL && <label className="group-link"><span>Новая ссылка — скопируйте и отправьте:</span><input readOnly value={teacherInviteURL} onFocus={(event) => event.currentTarget.select()} /></label>}<div className="admin-invites">{invites.length === 0 ? <p className="teacher-empty">Приглашений пока нет.</p> : invites.map((invite) => <article className="admin-invite-row" key={invite.id}><div><h2>{invite.type === "teacher" ? "Преподаватель" : "Ученик"}{invite.groupName ? ` · ${invite.groupName}` : ""}</h2><p>Создал: {invite.creatorName ?? invite.creatorEmail} · {dateTime(invite.createdAt)}</p><small>{invite.revokedAt ? "Отозвано" : invite.usedAt ? "Использовано" : invite.expiresAt ? `Действует до ${dateTime(invite.expiresAt)}` : "Активно"}</small></div>{!invite.revokedAt && !invite.usedAt && <button className="link-button group-delete" type="button" disabled={busy} onClick={() => revokeInvite(invite.id)}>Отозвать</button>}</article>)}</div></>}{tab === "tree" && <section className="admin-tree-panel"><h2>Дерево преподавателей</h2><p className="muted">Дерево показывает, кто пригласил каждого преподавателя.</p><Tree nodes={tree} /></section>}</>}</section>{pendingStatus && <section className="confirm-strip" role="dialog" aria-modal="true" aria-label="Изменение статуса пользователя"><p>{pendingStatus.status === "active" ? <>Заблокировать «{displayName(pendingStatus)}»? Все его активные сессии будут закрыты, а приглашения станут недействительны. Данные и группы сохранятся.</> : <>Разблокировать «{displayName(pendingStatus)}»? Для нового входа потребуется авторизация.</>}</p><button className="button" disabled={busy} onClick={changeStatus}>{pendingStatus.status === "active" ? "Заблокировать" : "Разблокировать"}</button><button className="button button--secondary" disabled={busy} onClick={() => setPendingStatus(null)}>Отмена</button></section>}</main>;
}
