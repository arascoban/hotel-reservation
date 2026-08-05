-- Migration: 033_menu_visibility.sql
-- Per-menu visibility switches for staff (Mitarbeiter) accounts.
--
-- One row per menu entry. `visible_for_staff = false` hides that menu from
-- every non-admin account. The admin (see src/lib/admin.ts) always sees
-- everything, so a switch can never lock the owner out of their own app.

CREATE TABLE IF NOT EXISTS menu_visibility (
  menu_key          TEXT        PRIMARY KEY,
  label             TEXT        NOT NULL,
  visible_for_staff BOOLEAN     NOT NULL DEFAULT true,
  sort_order        INT         NOT NULL DEFAULT 0,
  updated_by        TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed one row per menu/group. Keys match MENU_KEYS in src/lib/menus.ts.
INSERT INTO menu_visibility (menu_key, label, sort_order) VALUES
  ('search',    'Suche',                  10),
  ('calendar',  'Kalender',               20),
  ('customers', 'Kunden',                 30),
  ('arrivals',  'Ankünfte & Abreisen',    40),
  ('rooms',     'Zimmer & Schlüssel',     50),
  ('food',      'Food & Drinks',          60),
  ('finance',   'Finanzen & Statistiken', 70)
ON CONFLICT (menu_key) DO NOTHING;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE menu_visibility ENABLE ROW LEVEL SECURITY;

-- Everyone signed in must be able to read the switches — the sidebar needs
-- them to decide what to render.
DROP POLICY IF EXISTS "menu_visibility_select" ON menu_visibility;
CREATE POLICY "menu_visibility_select" ON menu_visibility
  FOR SELECT TO authenticated USING (true);

-- Only the admin account may flip a switch.
DROP POLICY IF EXISTS "menu_visibility_update" ON menu_visibility;
CREATE POLICY "menu_visibility_update" ON menu_visibility
  FOR UPDATE TO authenticated
  USING      ((auth.jwt() ->> 'email') = 'arascoban36@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'arascoban36@gmail.com');

CREATE OR REPLACE FUNCTION update_menu_visibility_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS menu_visibility_updated_at_trigger ON menu_visibility;
CREATE TRIGGER menu_visibility_updated_at_trigger
  BEFORE UPDATE ON menu_visibility
  FOR EACH ROW EXECUTE FUNCTION update_menu_visibility_updated_at();
