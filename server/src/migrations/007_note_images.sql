-- Fichiers privés du compte ; leur URL peut être réutilisée dans plusieurs notes.
CREATE TABLE note_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name text NOT NULL CHECK (length(original_name) BETWEEN 1 AND 200),
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg')),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 2560),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 2560),
  data_base64 text NOT NULL,
  byte_size integer GENERATED ALWAYS AS (octet_length(decode(data_base64,'base64'))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE INDEX idx_note_images_user ON note_images(user_id);
CREATE FUNCTION enforce_note_image_limits() RETURNS trigger AS $$
DECLARE used_bytes bigint; image_count bigint; new_bytes integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'note_image_immutable' USING ERRCODE='23514'; END IF;
  PERFORM id FROM users WHERE id=NEW.user_id FOR UPDATE;
  new_bytes := octet_length(decode(NEW.data_base64,'base64'));
  IF new_bytes > 4194304 THEN RAISE EXCEPTION 'note_image_size_limit' USING ERRCODE='P0001'; END IF;
  SELECT COALESCE(sum(byte_size),0),count(*) INTO used_bytes,image_count FROM note_images WHERE user_id=NEW.user_id;
  IF used_bytes+new_bytes>52428800 THEN RAISE EXCEPTION 'note_image_account_limit' USING ERRCODE='P0001'; END IF;
  IF image_count>=500 THEN RAISE EXCEPTION 'note_image_count_limit' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_note_images_limits BEFORE INSERT OR UPDATE ON note_images FOR EACH ROW EXECUTE FUNCTION enforce_note_image_limits();
