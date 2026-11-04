-- Le point de départ ne dépend pas de updated_at (édition de notes, renommage...).
ALTER TABLE chapters ADD COLUMN review_started_at timestamptz;
ALTER TABLE chapters ADD COLUMN initial_stability_days double precision;
ALTER TABLE chapters ADD CONSTRAINT chapters_review_baseline CHECK (
  (review_started_at IS NULL AND initial_stability_days IS NULL) OR
  (review_started_at IS NOT NULL AND initial_stability_days IS NOT NULL AND initial_stability_days BETWEEN 1 AND 3650)
);
-- Les chapitres déjà appris gardent une date inconnue : premier rappel immédiat, sans pourcentage fictif.
CREATE FUNCTION initialize_chapter_review() RETURNS trigger AS $$
BEGIN
  IF NEW.status <> 'not_started' AND NEW.review_started_at IS NULL THEN
    NEW.review_started_at := now();
    NEW.initial_stability_days := CASE NEW.status WHEN 'seen' THEN 2 WHEN 'understood' THEN 5 ELSE 10 END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_chapter_review_baseline BEFORE INSERT OR UPDATE OF status ON chapters FOR EACH ROW EXECUTE FUNCTION initialize_chapter_review();
CREATE TABLE reviews (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  rating text NOT NULL CHECK (rating IN ('again','hard','good','easy')),
  stability_days double precision NOT NULL CHECK (stability_days BETWEEN 1 AND 3650),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  model_version integer NOT NULL DEFAULT 1 CHECK (model_version=1),
  FOREIGN KEY (chapter_id,user_id) REFERENCES chapters(id,user_id) ON DELETE CASCADE,
  UNIQUE (chapter_id,user_id,ordinal)
);
CREATE INDEX idx_reviews_user_chapter ON reviews(user_id,chapter_id,ordinal DESC);
CREATE INDEX idx_reviews_user_date ON reviews(user_id,reviewed_at DESC);
