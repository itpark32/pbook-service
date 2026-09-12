import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

type InviteInfo = {
  type: "teacher" | "student";
  group?: { id: number; name: string };
  teacherName?: string;
};
type Account = { id: number; email: string; role: string; status: string };
type RegistrationForm = {
  email: string;
  password: string;
  passwordConfirmation: string;
  fullName: string;
  birthYear: string;
  city: string;
  institutionName: string;
  institutionType: string;
  classOrGroup: string;
};

const emptyForm: RegistrationForm = {
  email: "", password: "", passwordConfirmation: "", fullName: "", birthYear: "", city: "",
  institutionName: "", institutionType: "", classOrGroup: ""
};
const institutionNeedsName = new Set(["school", "college", "university", "public_supplementary", "private_supplementary"]);

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options?.body ? { "Content-Type": "application/json" } : {}), ...options?.headers }
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Не удалось выполнить запрос.");
  return body;
}

export function InvitePage({
  theme,
  onToggleTheme
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const { token = "" } = useParams();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [form, setForm] = useState<RegistrationForm>(emptyForm);

  const refreshAccount = async () => {
    try {
      const result = await apiRequest<{ user: Account }>("/api/v1/auth/me");
      setAccount(result.user);
      window.dispatchEvent(new Event("pbook:auth-ready"));
    } catch {
      setAccount(null);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ invite: InviteInfo }>(`/api/v1/invites/${encodeURIComponent(token)}`),
      apiRequest<{ user: Account }>("/api/v1/auth/me").catch(() => null)
    ])
      .then(([inviteResult, meResult]) => {
        if (!active) return;
        setInvite(inviteResult.invite);
        setAccount(meResult?.user ?? null);
      })
      .catch((reason: Error) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(""); setSubmitting(true);
    try {
      await apiRequest("/api/v1/auth/login", { method: "POST", body: JSON.stringify(login) });
      await refreshAccount();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти.");
    } finally { setSubmitting(false); }
  };

  const submitRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(""); setSubmitting(true);
    try {
      const result = await apiRequest<{ role: string }>(`/api/v1/invites/${encodeURIComponent(token)}/register`, {
        method: "POST", body: JSON.stringify({ ...form, birthYear: Number(form.birthYear) })
      });
      setMessage(result.role === "teacher" ? "Аккаунт преподавателя создан. Подтвердите email по ссылке из письма, чтобы создавать группы." : "Аккаунт создан, и вы добавлены в группу. Подтвердите email по ссылке из письма.");
      await refreshAccount();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось зарегистрироваться.");
    } finally { setSubmitting(false); }
  };

  const acceptInvite = async () => {
    setError(""); setSubmitting(true);
    try {
      const result = await apiRequest<{ role?: string }>(`/api/v1/invites/${encodeURIComponent(token)}/join`, { method: "POST", body: "{}" });
      setMessage(result.role === "teacher" ? "Ваша роль изменена на преподавателя. Подтвердите email, чтобы создавать группы." : "Вы присоединились к группе.");
      await refreshAccount();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось принять приглашение.");
    } finally { setSubmitting(false); }
  };

  const field = (name: keyof RegistrationForm, label: string, type = "text", required = true) => (
    <label className="invite-field">
      <span>{label}</span>
      <input type={type} value={form[name]} required={required} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} />
    </label>
  );

  return (
    <main className="invite-page">
      <header className="topbar topbar--home">
        <Link to="/" className="brand brand--topbar">IT-ПАРК <span>Python</span></Link>
        <button className="menu-button theme-toggle" type="button" onClick={onToggleTheme}>{theme === "light" ? "Тёмная тема" : "Светлая тема"}</button>
      </header>
      <section className="invite-card" aria-live="polite">
        {loading && <p className="muted">Проверяем приглашение…</p>}
        {!loading && error && !invite && <><p className="eyebrow">Приглашение</p><h1>Ссылка недействительна</h1><p>{error}</p><Link className="button button--secondary" to="/">На главную</Link></>}
        {!loading && invite && <>
          <p className="eyebrow">Приглашение в IT-ПАРК Python</p>
          <h1>{invite.type === "teacher" ? "Стать преподавателем" : "Присоединиться к группе"}</h1>
          {invite.type === "teacher" ? <p>По этой ссылке можно создать аккаунт преподавателя.</p> : <p>Группа <strong>{invite.group?.name}</strong>{invite.teacherName ? ` · преподаватель: ${invite.teacherName}` : ""}.</p>}
          {message && <p className="invite-notice invite-notice--success">{message}</p>}
          {error && <p className="invite-notice invite-notice--error">{error}</p>}
          {account ? <section className="invite-existing"><h2>Вы вошли как {account.email}</h2><p>Примите приглашение, если оно предназначено для этого аккаунта.</p><button className="button" type="button" disabled={submitting || Boolean(message)} onClick={acceptInvite}>{submitting ? "Сохраняем…" : "Принять приглашение"}</button></section> :
            <div className="invite-columns">
              <form className="invite-login" onSubmit={submitLogin}><h2>Уже есть аккаунт?</h2><p>Войдите, чтобы принять приглашение без создания второго аккаунта.</p><label className="invite-field"><span>Email</span><input type="email" required value={login.email} onChange={(event) => setLogin((current) => ({ ...current, email: event.target.value }))} /></label><label className="invite-field"><span>Пароль</span><input type="password" required value={login.password} onChange={(event) => setLogin((current) => ({ ...current, password: event.target.value }))} /></label><button className="button button--secondary" type="submit" disabled={submitting}>{submitting ? "Входим…" : "Войти"}</button></form>
              <form className="invite-register" onSubmit={submitRegistration}><h2>Создать аккаунт</h2><div className="invite-form-grid">{field("fullName", "ФИО")}{field("birthYear", "Год рождения", "number")}{field("city", "Город")}{field("email", "Email", "email")}{field("password", "Пароль", "password")}{field("passwordConfirmation", "Повторите пароль", "password")}<label className="invite-field"><span>Тип организации</span><select required value={form.institutionType} onChange={(event) => setForm((current) => ({ ...current, institutionType: event.target.value }))}><option value="">Выберите тип</option><option value="school">Школа / лицей / гимназия</option><option value="college">Колледж / техникум</option><option value="university">ВУЗ</option><option value="public_supplementary">Государственное дополнительное образование</option><option value="private_supplementary">Частное дополнительное образование</option><option value="tutor">Репетиторство</option><option value="self_study">Самостоятельное обучение</option><option value="other">Другое</option></select></label>{field("institutionName", "Организация", "text", institutionNeedsName.has(form.institutionType))}{invite.type === "student" && field("classOrGroup", "Класс или группа")}</div><button className="button" type="submit" disabled={submitting}>{submitting ? "Создаём…" : "Создать аккаунт"}</button></form>
            </div>}
        </>}
      </section>
    </main>
  );
}
