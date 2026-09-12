# API

## Health

`GET /api/v1/health`

Ответ `200 OK`:

```json
{"status":"ok"}
```

## Authentication

Public self-registration deliberately does not exist: student and teacher accounts will be created from invitations in Phase 12. A local administrator can be seeded only through the `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` environment variables.

All mutating auth requests accept JSON, reject a foreign `Origin`, and are rate limited. A successful login creates an opaque, server-side session for 30 days. The browser receives it only in the `pbook_session` cookie (`HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` is enabled outside local HTTP development).

Every error uses one stable envelope, so clients never need to parse a server string:

```json
{"error":{"code":"invalid_credentials","message":"Неверный email или пароль."}}
```

### `POST /api/v1/auth/login`

Request:

```json
{"email":"student@example.test","password":"correct-password"}
```

Success: `200 {"ok":true}` and the session cookie. Incorrect credentials and a blocked account both return `401` with `error.code = invalid_credentials`.

### `POST /api/v1/auth/logout`

Deletes the current server-side session and expires the browser cookie. Returns `200 {"ok":true}` even if the cookie is absent.

### `GET /api/v1/auth/me`

Returns the active session owner:

```json
{"user":{"id":1,"email":"student@example.test","role":"student","status":"active"}}
```

An absent, expired, revoked, or blocked session returns `401` with `error.code = unauthenticated`.

### Email verification and password recovery

- `POST /api/v1/auth/verify-email` with `{"token":"…"}` consumes a one-use token valid for 24 hours.
- `POST /api/v1/auth/resend-verification` requires an authenticated, unverified user. It has a one-minute resend cooldown and invalidates an earlier unused verification token when it creates a new one.
- `POST /api/v1/auth/forgot-password` with `{"email":"…"}` always returns the same success message, whether or not the account exists.
- `POST /api/v1/auth/reset-password` with `{"token":"…","password":"…"}` consumes a one-use token valid for 30 minutes, verifies the account, and revokes every existing session.

In local development the mail adapter writes the complete verification and reset URLs (based on `APP_ORIGIN`) to the backend container log. Tokens are stored in the database as SHA-256 hashes only; passwords use Argon2id.

## Invites and registration

There is no public registration endpoint. A browser opens the public frontend URL `/invite/:token`; the invite page validates its token through `GET /api/v1/invites/:token` and then chooses either registration or joining an existing account. Invitation tokens are opaque random values and PostgreSQL stores only their SHA-256 hash.

### Teacher invites

- `POST /api/v1/invites/teacher` — available to an admin or an email-verified teacher. Creates a single-use link valid for seven days and returns its local URL plus `expiresAt`.
- `POST /api/v1/invites/:token/revoke` — available to the invite creator or an admin; a revoked link becomes invalid immediately.
- `POST /api/v1/invites/:token/register` — creates a new teacher from a valid teacher link, records `invited_by_user_id`, sends email verification, and starts a session.
- `POST /api/v1/invites/:token/join` — lets an existing student accept a teacher invitation. It promotes the same user to `teacher`, keeps existing data, and consumes the link. An existing teacher cannot consume another teacher invitation.

### Student invites

Student links are created for one group by its verified teacher:

```text
POST /api/v1/groups/:groupID/student-invite
```

Creating one revokes the previous active student link for that group, so regeneration takes effect immediately. Student links do not expire and are multi-use until revoked or regenerated. A blocked teacher's links are invalid because validation requires the link creator to remain active.

`POST /api/v1/invites/:token/register` creates a new student and membership in the linked group. `POST /api/v1/invites/:token/join` adds a signed-in existing student to that group idempotently.

Registration JSON includes `email`, `password`, `passwordConfirmation`, `fullName`, `birthYear`, `city`, `institutionType`, optional `institutionName`, and `classOrGroup`. `institutionName` is required for school, college, university, and supplementary-education types; `classOrGroup` is required for students.

### Minimal group endpoint

`POST /api/v1/groups` with `{"name":"…"}` is available only to an email-verified teacher. It exists now solely to create a group before issuing its student invite. Group listing, renaming, deletion, and participant management are completed in Phase 13.

## Groups

All group routes require an authenticated, email-verified teacher. The backend checks `groups.teacher_id` on every request; a teacher cannot read or mutate another teacher's group.

- `GET /api/v1/groups` returns only the current teacher's groups, each with its members.
- `POST /api/v1/groups` creates a group from `{"name":"…"}`.
- `PATCH /api/v1/groups/:groupID` renames an owned group with the same payload.
- `DELETE /api/v1/groups/:groupID` deletes the group, its memberships, and its group-bound invitations. It never deletes user accounts.
- `DELETE /api/v1/groups/:groupID/members/:userID` removes only a student membership. The user and their progress remain intact.

The browser cabinet is available at `/teacher/groups`. It also provides controlled confirmation panels for deleting a group or removing a participant, rather than a native browser alert.

## Cloud progress

Authenticated users use the following endpoints; guests continue to keep progress in `localStorage`.

- `GET /api/v1/progress` returns the caller's exercise and lesson progress.
- `PUT /api/v1/progress/exercises/:exerciseID` debounced-saves `code`, `stdin`, and `solutionRevealed`.
- `POST /api/v1/progress/exercises/:exerciseID/attempt` increments `attemptsCount` only for a check. A passed checkpoint marks its lesson completed.
- `PUT /api/v1/progress/lessons/:lessonID` records `in_progress` or `completed`; completed status is never reset by a later failure.
- `POST /api/v1/progress/import` merges guest data after an explicit user choice. Completion uses logical OR. A different non-empty cloud and local code returns `409 progress_conflict` with both versions; the client must submit `codeResolutions` (`local` or `cloud`) before import continues.

The exercise workspace shows `Сохранение…` and `Сохранено` for a signed-in user; its debounce also records the lesson as `in_progress`. The import modal appears only when this device has local guest progress and asks before any transfer, including immediately after a successful sign-in or registration.

## Teacher cabinet

All teacher endpoints require an active, email-verified teacher session and are read-only.

- `GET /api/v1/teacher/groups/:groupID/students` returns profiles and aggregate progress for students of the teacher's own group.
- `GET /api/v1/teacher/students/:studentID` returns a student's profile, lesson states, exercise list and course counters.
- `GET /api/v1/teacher/students/:studentID/exercises/:exerciseID` returns the last saved code and check metadata for one exercise.

For a student or group belonging to another teacher the API returns `403 forbidden`; the UI is not used as an authorization boundary.

## Admin panel

These endpoints require an active admin session; they are never available through public registration.

- `GET /api/v1/admin/users` searches by name/email and supports `role`, `status`, `city`, `institutionType`, `institutionName`, and `birthYear` filters.
- `PATCH /api/v1/admin/users/:userID/status` accepts `active` or `blocked`. Blocking closes every active session for that user.
- `GET /api/v1/admin/invites` lists teacher and student invites; `POST /api/v1/admin/invites/:inviteID/revoke` invalidates one.
- `GET /api/v1/admin/teacher-tree` returns a tree generated from `users.invited_by_user_id`.

When a creator is blocked, existing invite validation rejects the creator's teacher invites and student invites for their groups. Users, groups and progress are retained.
