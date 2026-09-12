CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id text NOT NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed')),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS exercise_progress (
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  attempts_count integer NOT NULL DEFAULT 0 CHECK (attempts_count >= 0),
  passed_tests integer,
  total_tests integer,
  code text,
  stdin text,
  solution_revealed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (user_id, exercise_id),
  CHECK (passed_tests IS NULL OR passed_tests >= 0),
  CHECK (total_tests IS NULL OR total_tests >= 0)
);

CREATE INDEX IF NOT EXISTS lesson_progress_user_id_idx ON lesson_progress (user_id);
CREATE INDEX IF NOT EXISTS exercise_progress_user_id_idx ON exercise_progress (user_id);
