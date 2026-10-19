-- Schéma initial. user_id vaut une valeur fixe en V1 (préparation du multi-utilisateur).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TABLE years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  year_id uuid NOT NULL REFERENCES years(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  coefficient numeric(5,2),
  teacher text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  content_md text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','seen','understood','revised')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL DEFAULT 'controle' CHECK (type IN ('controle','projet','examen','autre')),
  date date NOT NULL,
  coefficient numeric(5,2),
  grade numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Liaison N-N évaluation <-> chapitre.
CREATE TABLE evaluation_chapters (
  evaluation_id uuid NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  PRIMARY KEY (evaluation_id, chapter_id)
);

CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text,
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  ics_uid text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index sur les clés étrangères et les dates.
CREATE INDEX idx_semesters_year ON semesters(year_id);
CREATE INDEX idx_subjects_semester ON subjects(semester_id);
CREATE INDEX idx_chapters_subject ON chapters(subject_id);
CREATE INDEX idx_chapters_updated ON chapters(updated_at DESC);
CREATE INDEX idx_evaluations_subject ON evaluations(subject_id);
CREATE INDEX idx_evaluations_date ON evaluations(date);
CREATE INDEX idx_evalchap_chapter ON evaluation_chapters(chapter_id);
CREATE INDEX idx_events_starts ON calendar_events(starts_at);
CREATE INDEX idx_events_subject ON calendar_events(subject_id);

-- Mise à jour automatique de updated_at.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['years','semesters','subjects','chapters','evaluations','calendar_events'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
