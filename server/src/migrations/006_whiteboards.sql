-- Scènes Excalidraw privées, rattachées à exactement une matière OU un chapitre.
CREATE TABLE whiteboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id uuid,
  chapter_id uuid,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  scene jsonb NOT NULL CHECK (COALESCE(
    jsonb_typeof(scene) = 'object' AND scene->>'type' = 'excalidraw'
    AND scene->>'version' = '2' AND jsonb_typeof(scene->'elements') = 'array', false)
  ),
  scene_bytes integer GENERATED ALWAYS AS (octet_length(scene::text)) STORED,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whiteboards_parent_check CHECK (num_nonnulls(subject_id, chapter_id) = 1),
  CONSTRAINT whiteboards_id_user_key UNIQUE (id, user_id),
  CONSTRAINT whiteboards_subject_user_fk FOREIGN KEY (subject_id, user_id)
    REFERENCES subjects(id, user_id) ON DELETE CASCADE,
  CONSTRAINT whiteboards_chapter_user_fk FOREIGN KEY (chapter_id, user_id)
    REFERENCES chapters(id, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_whiteboards_user ON whiteboards(user_id);
CREATE INDEX idx_whiteboards_subject ON whiteboards(subject_id);
CREATE INDEX idx_whiteboards_chapter ON whiteboards(chapter_id);

-- Quotas aussi imposés en base, y compris pour des écritures contournant l'API.
-- Le verrou du compte sérialise les créations/modifications concurrentes.
CREATE FUNCTION enforce_whiteboard_limits() RETURNS trigger AS $$
DECLARE used_bytes bigint; boards_count bigint; new_bytes integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.user_id <> OLD.user_id OR
      NEW.subject_id IS DISTINCT FROM OLD.subject_id OR
      NEW.chapter_id IS DISTINCT FROM OLD.chapter_id) THEN
    RAISE EXCEPTION 'whiteboard_parent_immutable' USING ERRCODE = '23514';
  END IF;
  PERFORM id FROM users WHERE id = NEW.user_id FOR UPDATE;
  new_bytes := octet_length(NEW.scene::text);
  IF new_bytes > 2097152 THEN
    RAISE EXCEPTION 'whiteboard_scene_limit' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(sum(scene_bytes), 0), count(*) INTO used_bytes, boards_count
    FROM whiteboards WHERE user_id = NEW.user_id AND id <> NEW.id;
  IF used_bytes + new_bytes > 20971520 THEN
    RAISE EXCEPTION 'whiteboard_account_limit' USING ERRCODE = 'P0001';
  END IF;
  IF boards_count >= 200 THEN
    RAISE EXCEPTION 'whiteboard_count_limit' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.revision := OLD.revision + 1;
    NEW.updated_at := now();
  ELSE
    NEW.revision := 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_whiteboards_limits BEFORE INSERT OR UPDATE ON whiteboards
  FOR EACH ROW EXECUTE FUNCTION enforce_whiteboard_limits();
