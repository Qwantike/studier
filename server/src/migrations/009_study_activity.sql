-- Une activité correspond à un rappel enregistré, y compris « À revoir ».
-- La clé de la révision rend le journal et son rattrapage idempotents.
ALTER TABLE reviews ADD CONSTRAINT reviews_id_user_unique UNIQUE(id,user_id);
CREATE TABLE study_activity (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  kind text NOT NULL DEFAULT 'review' CHECK (kind='review'),
  FOREIGN KEY (id,user_id) REFERENCES reviews(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (chapter_id,user_id) REFERENCES chapters(id,user_id) ON DELETE CASCADE
);
CREATE INDEX idx_study_activity_user_date ON study_activity(user_id,occurred_at DESC,id);
CREATE INDEX idx_study_activity_user_chapter ON study_activity(user_id,chapter_id,occurred_at);
CREATE FUNCTION log_study_review() RETURNS trigger AS $$
BEGIN
  INSERT INTO study_activity(id,user_id,chapter_id,occurred_at)
  VALUES(NEW.id,NEW.user_id,NEW.chapter_id,NEW.reviewed_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_study_review AFTER INSERT ON reviews
FOR EACH ROW EXECUTE FUNCTION log_study_review();
INSERT INTO study_activity(id,user_id,chapter_id,occurred_at)
SELECT id,user_id,chapter_id,reviewed_at FROM reviews ON CONFLICT DO NOTHING;
CREATE TABLE study_preferences (
  id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  weekly_days integer NOT NULL DEFAULT 3 CHECK (weekly_days BETWEEN 1 AND 7),
  CHECK (id=user_id)
);
