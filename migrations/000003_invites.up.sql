CREATE TABLE IF NOT EXISTS groups (
  id bigserial PRIMARY KEY,
  teacher_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS groups_teacher_id_idx ON groups (teacher_id);

CREATE TABLE IF NOT EXISTS group_memberships (
  group_id bigint NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS group_memberships_user_id_idx ON group_memberships (user_id);

CREATE TABLE IF NOT EXISTS invites (
  id bigserial PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('teacher', 'student')),
  token_hash text NOT NULL UNIQUE,
  created_by_user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  group_id bigint REFERENCES groups(id) ON DELETE CASCADE,
  expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (type = 'teacher' AND group_id IS NULL AND expires_at IS NOT NULL)
    OR
    (type = 'student' AND group_id IS NOT NULL AND expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS invites_created_by_idx ON invites (created_by_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS invites_one_active_student_per_group
  ON invites (group_id)
  WHERE type = 'student' AND revoked_at IS NULL;
