-- BikeParts — PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  google_id     VARCHAR(255) UNIQUE,
  name          VARCHAR(255) NOT NULL,
  avatar_url    TEXT,
  role          VARCHAR(20) NOT NULL DEFAULT 'user', -- 'user' | 'admin'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- STRAVA TOKENS
-- ─────────────────────────────────────────
CREATE TABLE strava_tokens (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strava_athlete_id BIGINT NOT NULL,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ─────────────────────────────────────────
-- BIKE CATALOG (données fabricants)
-- ─────────────────────────────────────────
CREATE TABLE bikes_catalog (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand       VARCHAR(100) NOT NULL,
  model       VARCHAR(255) NOT NULL,
  year        SMALLINT NOT NULL,
  color       VARCHAR(100),
  color_code  VARCHAR(50),
  category    VARCHAR(100),           -- 'road', 'mtb', 'gravel', 'urban', etc.
  specs       JSONB,                  -- composants, geometry, poids, etc.
  image_url   TEXT,
  source_url  TEXT,
  source      VARCHAR(50),            -- 'scraping' | 'api' | 'manual'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalog_brand ON bikes_catalog(brand);
CREATE INDEX idx_catalog_year  ON bikes_catalog(year);
CREATE INDEX idx_catalog_brand_model_year ON bikes_catalog(brand, model, year);

-- ─────────────────────────────────────────
-- GARAGE (vélos de l'utilisateur)
-- ─────────────────────────────────────────
CREATE TABLE garage_bikes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  catalog_id       UUID REFERENCES bikes_catalog(id) ON DELETE SET NULL,
  strava_bike_id   VARCHAR(50),       -- ex: 'b12345' (id Strava)
  name             VARCHAR(255) NOT NULL,
  brand            VARCHAR(100),
  model            VARCHAR(255),
  year             SMALLINT,
  color            VARCHAR(100),
  image_url        TEXT,
  total_distance   NUMERIC(10, 2) NOT NULL DEFAULT 0, -- km, synchronisé depuis Strava
  notes            TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_garage_user ON garage_bikes(user_id);

-- ─────────────────────────────────────────
-- CATÉGORIES DE PIÈCES
-- ─────────────────────────────────────────
CREATE TABLE part_categories (
  id       SERIAL PRIMARY KEY,
  name     VARCHAR(100) NOT NULL UNIQUE,
  icon     VARCHAR(50)  -- nom d'icône pour le frontend
);

INSERT INTO part_categories (name, icon) VALUES
  ('Chaîne',              'chain'),
  ('Cassette',            'cassette'),
  ('Plateau',             'chainring'),
  ('Pédalier',            'crankset'),
  ('Dérailleur arrière',  'derailleur_rear'),
  ('Dérailleur avant',    'derailleur_front'),
  ('Frein avant',         'brake'),
  ('Frein arrière',       'brake'),
  ('Plaquettes avant',    'brake_pad'),
  ('Plaquettes arrière',  'brake_pad'),
  ('Roue avant',          'wheel'),
  ('Roue arrière',        'wheel'),
  ('Pneu avant',          'tyre'),
  ('Pneu arrière',        'tyre'),
  ('Câbles/Gaines',       'cable'),
  ('Fourche',             'fork'),
  ('Tige de selle',       'seatpost'),
  ('Selle',               'saddle'),
  ('Cintre',              'handlebar'),
  ('Potence',             'stem'),
  ('Pédales',             'pedals'),
  ('Boîtier de pédalier', 'bottom_bracket'),
  ('Autre',               'other');

-- ─────────────────────────────────────────
-- PIÈCES (sur un vélo du garage)
-- ─────────────────────────────────────────
CREATE TABLE parts (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  garage_bike_id       UUID NOT NULL REFERENCES garage_bikes(id) ON DELETE CASCADE,
  category_id          INTEGER NOT NULL REFERENCES part_categories(id),
  brand                VARCHAR(100),
  model                VARCHAR(255),
  notes                TEXT,
  installed_at_km      NUMERIC(10, 2) NOT NULL DEFAULT 0, -- km du vélo au moment de la pose
  installed_date       DATE,
  removed_at_km        NUMERIC(10, 2),                    -- km du vélo au moment du retrait (null = encore en place)
  removed_date         DATE,
  max_km_recommended   NUMERIC(10, 2),                    -- km de durée de vie recommandée
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parts_bike ON parts(garage_bike_id);

-- ─────────────────────────────────────────
-- TRIGGER: updated_at automatique
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_strava_updated
  BEFORE UPDATE ON strava_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_catalog_updated
  BEFORE UPDATE ON bikes_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_garage_updated
  BEFORE UPDATE ON garage_bikes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_parts_updated
  BEFORE UPDATE ON parts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  part_id    UUID REFERENCES parts(id) ON DELETE CASCADE,
  bike_id    UUID REFERENCES garage_bikes(id) ON DELETE CASCADE,
  type       VARCHAR(50) NOT NULL,  -- 'part_warning' | 'part_critical'
  title      VARCHAR(255) NOT NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user     ON notifications(user_id);
CREATE INDEX idx_notif_unread   ON notifications(user_id, is_read) WHERE is_read = FALSE;
