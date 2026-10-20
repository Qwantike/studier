-- Planification des synchronisations d'abonnements : chaque abonnement sait quand il doit être resynchronisé,
-- et espace ses tentatives après des échecs (backoff exponentiel, plafonné à 24 h).
ALTER TABLE calendar_sources
  ADD COLUMN next_sync_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN failures integer NOT NULL DEFAULT 0;
CREATE INDEX idx_calendar_sources_due ON calendar_sources(next_sync_at);