-- Multi-utilisateur, étape 2 : intégrité entre comptes.
-- À appliquer APRÈS avoir déployé le code qui renseigne user_id partout (routes, seed, upsertEvents).

-- 1) Clés étrangères composites (id, user_id) : un enfant ne peut référencer qu'un parent du MÊME utilisateur,
--    même si une route oubliait de vérifier.
ALTER TABLE years       ADD CONSTRAINT years_id_user_key       UNIQUE (id, user_id);
ALTER TABLE semesters   ADD CONSTRAINT semesters_id_user_key   UNIQUE (id, user_id);
ALTER TABLE subjects    ADD CONSTRAINT subjects_id_user_key    UNIQUE (id, user_id);
ALTER TABLE chapters    ADD CONSTRAINT chapters_id_user_key    UNIQUE (id, user_id);
ALTER TABLE evaluations ADD CONSTRAINT evaluations_id_user_key UNIQUE (id, user_id);

ALTER TABLE semesters DROP CONSTRAINT semesters_year_id_fkey;
ALTER TABLE semesters ADD CONSTRAINT semesters_year_user_fk
  FOREIGN KEY (year_id, user_id) REFERENCES years (id, user_id) ON DELETE CASCADE;

ALTER TABLE subjects DROP CONSTRAINT subjects_semester_id_fkey;
ALTER TABLE subjects ADD CONSTRAINT subjects_semester_user_fk
  FOREIGN KEY (semester_id, user_id) REFERENCES semesters (id, user_id) ON DELETE CASCADE;

ALTER TABLE chapters DROP CONSTRAINT chapters_subject_id_fkey;
ALTER TABLE chapters ADD CONSTRAINT chapters_subject_user_fk
  FOREIGN KEY (subject_id, user_id) REFERENCES subjects (id, user_id) ON DELETE CASCADE;

ALTER TABLE evaluations DROP CONSTRAINT evaluations_subject_id_fkey;
ALTER TABLE evaluations ADD CONSTRAINT evaluations_subject_user_fk
  FOREIGN KEY (subject_id, user_id) REFERENCES subjects (id, user_id) ON DELETE CASCADE;

-- 2) Liaison évaluation <-> chapitre : elle reçoit user_id (rempli depuis l'évaluation) pour garantir
--    qu'une évaluation et un chapitre liés appartiennent au même utilisateur.
ALTER TABLE evaluation_chapters ADD COLUMN user_id uuid;
UPDATE evaluation_chapters ec SET user_id = e.user_id FROM evaluations e WHERE e.id = ec.evaluation_id;
ALTER TABLE evaluation_chapters ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE evaluation_chapters DROP CONSTRAINT evaluation_chapters_evaluation_id_fkey;
ALTER TABLE evaluation_chapters DROP CONSTRAINT evaluation_chapters_chapter_id_fkey;
ALTER TABLE evaluation_chapters ADD CONSTRAINT evalchap_evaluation_user_fk
  FOREIGN KEY (evaluation_id, user_id) REFERENCES evaluations (id, user_id) ON DELETE CASCADE;
ALTER TABLE evaluation_chapters ADD CONSTRAINT evalchap_chapter_user_fk
  FOREIGN KEY (chapter_id, user_id) REFERENCES chapters (id, user_id) ON DELETE CASCADE;
CREATE INDEX idx_evalchap_user ON evaluation_chapters(user_id);

-- 3) Plus de valeur par défaut : un INSERT qui oublie user_id échoue au lieu d'atterrir dans le compte hérité.
-- (calendar_events.subject_id / source_id gardent une clé simple : SET NULL composite exige PostgreSQL 15+,
--  la vérification de propriété reste faite par les routes.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['years','semesters','subjects','chapters','evaluations','calendar_events','calendar_sources'] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN user_id DROP DEFAULT', t);
  END LOOP;
END $$;