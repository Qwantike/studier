-- Paramètres IA par utilisateur
CREATE TABLE ai_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  api_key_encrypted text NOT NULL,
  api_key_suffix text NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Suivi des générations asynchrones
CREATE TABLE ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- pending, done, error
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_jobs_user ON ai_jobs(user_id);

-- Évaluations générées
CREATE TABLE ai_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_evaluations ADD CONSTRAINT ai_evaluations_id_user_key UNIQUE (id, user_id);

-- Liaison stricte pour isolation avec clés composites
CREATE TABLE ai_evaluation_chapters (
  ai_evaluation_id uuid NOT NULL,
  chapter_id uuid NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY (ai_evaluation_id, chapter_id),
  FOREIGN KEY (ai_evaluation_id, user_id) REFERENCES ai_evaluations(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (chapter_id, user_id) REFERENCES chapters(id, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_ai_evalchap_user ON ai_evaluation_chapters(user_id);