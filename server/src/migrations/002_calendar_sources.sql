-- Abonnements à des calendriers distants (.ics par URL).
CREATE TABLE calendar_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name text NOT NULL,
  url text NOT NULL UNIQUE,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_calendar_sources_updated BEFORE UPDATE ON calendar_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Les événements d'un abonnement gardent leur origine ; supprimer l'abonnement les conserve (SET NULL)
-- sauf si l'utilisateur demande explicitement de les supprimer aussi.
ALTER TABLE calendar_events ADD COLUMN source_id uuid REFERENCES calendar_sources(id) ON DELETE SET NULL;
CREATE INDEX idx_events_source ON calendar_events(source_id);

-- "Modifiés récemment" : updated_at d'un chapitre ne bouge plus quand on ne fait que le déplacer
-- (monter/descendre change position, pas le contenu).
CREATE OR REPLACE FUNCTION chapters_set_updated_at() RETURNS trigger AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.content_md IS DISTINCT FROM OLD.content_md
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.updated_at = now();
  ELSE
    NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER trg_chapters_updated ON chapters;
CREATE TRIGGER trg_chapters_updated BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION chapters_set_updated_at();
