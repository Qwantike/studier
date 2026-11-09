-- Le registre de consommation survit à la suppression d'un chapitre : pas de contournement du quota.
CREATE TABLE quiz_generation_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'generating' CHECK(status IN ('generating','ready','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id)
);
CREATE INDEX idx_quiz_requests_user_date ON quiz_generation_requests(user_id,created_at DESC);
CREATE TABLE quizzes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL,
  chapter_title text NOT NULL,
  difficulty text NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
  request_hash text NOT NULL,
  source_hash text NOT NULL,
  model text NOT NULL,
  prompt_version integer NOT NULL DEFAULT 1 CHECK(prompt_version=1),
  consent_version integer NOT NULL DEFAULT 1 CHECK(consent_version=1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id),
  FOREIGN KEY(id,user_id) REFERENCES quiz_generation_requests(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(chapter_id,user_id) REFERENCES chapters(id,user_id) ON DELETE CASCADE
);
CREATE INDEX idx_quizzes_user_chapter ON quizzes(user_id,chapter_id,created_at DESC);
CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL,
  position integer NOT NULL CHECK(position BETWEEN 0 AND 4),
  prompt text NOT NULL CHECK(length(prompt) BETWEEN 1 AND 1000),
  options jsonb NOT NULL CHECK(jsonb_typeof(options)='array' AND jsonb_array_length(options)=4),
  correct_index integer NOT NULL CHECK(correct_index BETWEEN 0 AND 3),
  explanation text NOT NULL CHECK(length(explanation) BETWEEN 1 AND 2000),
  FOREIGN KEY(quiz_id,user_id) REFERENCES quizzes(id,user_id) ON DELETE CASCADE,
  UNIQUE(quiz_id,position)
);
CREATE TABLE attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL,
  answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='object'),
  score integer NOT NULL CHECK(score BETWEEN 0 AND 5),
  total integer NOT NULL DEFAULT 5 CHECK(total=5),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(quiz_id,user_id) REFERENCES quizzes(id,user_id) ON DELETE CASCADE
);
CREATE INDEX idx_attempts_user_quiz ON attempts(user_id,quiz_id,created_at DESC);
