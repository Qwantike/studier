-- Multi-utilisateur, étape 1 : comptes, sessions, rattachement des données existantes.
-- Les DEFAULT de user_id sont conservés ici ; ils seront retirés en 004, une fois le code serveur passé à user_id explicite.

-- Comptes. L'email est stocké en minuscules (normalisé côté app, imposé par le CHECK).
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text,                       -- NULL = compte non activé, connexion impossible
  display_name text NOT NULL DEFAULT '',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sessions : une ligne par appareil. Le refresh token (aléatoire, dans un cookie httpOnly) n'est jamais stocké en clair,
-- seulement son hash SHA-256. Rotation à chaque refresh : on remplace token_hash sur la même ligne.
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip text,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Compte hérité : porte toutes les données créées en V1 (user_id = 00000000-...-0001).
-- Sans mot de passe, donc inutilisable tant qu'il n'est pas « réclamé » (script CLI à venir : email + mot de passe).
INSERT INTO users (id, email, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'legacy@invalid.local', 'Compte existant');

-- user_id devient une vraie clé étrangère + index (supprimer un utilisateur supprime ses données).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['years','semesters','subjects','chapters','evaluations','calendar_events','calendar_sources'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
                   t, t || '_user_fk');
    EXECUTE format('CREATE INDEX %I ON %I(user_id)', 'idx_' || t || '_user', t);
  END LOOP;
END $$;

-- Unicité par utilisateur (sinon deux comptes ne pourraient pas avoir le même événement ou le même abonnement).
-- Les upserts doivent passer à ON CONFLICT (user_id, ics_uid).
ALTER TABLE calendar_events DROP CONSTRAINT calendar_events_ics_uid_key;
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_user_ics_uid_key UNIQUE (user_id, ics_uid);

ALTER TABLE calendar_sources DROP CONSTRAINT calendar_sources_url_key;
ALTER TABLE calendar_sources ADD CONSTRAINT calendar_sources_user_url_key UNIQUE (user_id, url);