-- ─────────────────────────────────────────────────────────────────────────────
-- 009 · Room Service
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Unique order-token per room (used in QR-code URL as auth secret)
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS order_token UUID NOT NULL DEFAULT gen_random_uuid();

-- 2. Menu items
CREATE TABLE IF NOT EXISTS menu_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  price        NUMERIC(10,2) NOT NULL,
  category     TEXT        NOT NULL DEFAULT 'Sonstiges',
  is_available BOOLEAN     NOT NULL DEFAULT true,
  sort_order   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Room orders
CREATE TABLE IF NOT EXISTS room_orders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID        NOT NULL REFERENCES rooms(id),
  room_number TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','preparing','delivered','cancelled')),
  total_price NUMERIC(10,2),
  guest_notes TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Order items
CREATE TABLE IF NOT EXISTS order_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID        NOT NULL REFERENCES room_orders(id) ON DELETE CASCADE,
  menu_item_id     UUID        REFERENCES menu_items(id),
  menu_item_name   TEXT        NOT NULL,
  quantity         INT         NOT NULL DEFAULT 1,
  price_at_order   NUMERIC(10,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. RLS
ALTER TABLE menu_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Menu: anyone can read (public menu page)
CREATE POLICY "Public read menu_items"  ON menu_items  FOR SELECT USING (true);
CREATE POLICY "Auth manage menu_items"  ON menu_items  FOR ALL    USING (auth.role() = 'authenticated');

-- Orders: only staff can read/update (guests use SECURITY DEFINER RPC)
CREATE POLICY "Auth read room_orders"   ON room_orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth update room_orders" ON room_orders FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete room_orders" ON room_orders FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Auth read order_items"   ON order_items FOR SELECT USING (auth.role() = 'authenticated');

-- 6. RPC: validate token (called from server component – anon ok via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION validate_room_token(p_room_number TEXT, p_token UUID)
RETURNS TABLE(room_id UUID, room_name TEXT, room_number TEXT)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT id, name, room_number
  FROM   rooms
  WHERE  rooms.room_number = p_room_number
    AND  order_token        = p_token
    AND  is_active          = true
  LIMIT 1;
$$;

-- 7. RPC: place order (validates token + inserts atomically – anon ok via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION place_room_order(
  p_room_number TEXT,
  p_token       UUID,
  p_items       JSONB,          -- [{menu_item_id: uuid, quantity: int}, ...]
  p_guest_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id    UUID;
  v_order_id   UUID;
  v_total      NUMERIC(10,2) := 0;
  v_item       JSONB;
  v_item_name  TEXT;
  v_item_price NUMERIC(10,2);
  v_qty        INT;
BEGIN
  -- Validate token
  SELECT id INTO v_room_id
  FROM   rooms
  WHERE  room_number  = p_room_number
    AND  order_token  = p_token
    AND  is_active    = true;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  -- Create order record
  INSERT INTO room_orders (room_id, room_number, status, guest_notes)
  VALUES (v_room_id, p_room_number, 'new', p_guest_notes)
  RETURNING id INTO v_order_id;

  -- Insert line items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::INT;

    SELECT name, price INTO v_item_name, v_item_price
    FROM   menu_items
    WHERE  id           = (v_item->>'menu_item_id')::UUID
      AND  is_available = true;

    IF v_item_name IS NULL THEN
      RAISE EXCEPTION 'item_unavailable';
    END IF;

    INSERT INTO order_items (order_id, menu_item_id, menu_item_name, quantity, price_at_order)
    VALUES (v_order_id, (v_item->>'menu_item_id')::UUID, v_item_name, v_qty, v_item_price);

    v_total := v_total + (v_item_price * v_qty);
  END LOOP;

  UPDATE room_orders SET total_price = v_total WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;

-- 8. Sample menu data
INSERT INTO menu_items (name, description, price, category, sort_order) VALUES
  ('Frühstückstablett',  'Croissant, Aufschnitt, Käse, Marmelade, Butter, OJ & Kaffee', 12.50, 'Frühstück',      10),
  ('Croissant',          'Frisches Buttercroissant mit Marmelade & Butter',               3.50, 'Frühstück',      20),
  ('Rühreier mit Toast', '2 Rühreier, Toastbrot & Butter',                               7.00, 'Frühstück',      30),
  ('Obstsalat',          'Frischer Obstsalat der Saison',                                 5.00, 'Frühstück',      40),
  ('Club Sandwich',      'Hähnchen, Speck, Ei, Salat & Tomate auf Toastbrot',            9.50, 'Snacks',          50),
  ('Käseplatte',         'Deutsche Käsesorten mit Trauben & Baguette',                   8.50, 'Snacks',          60),
  ('Snackkorb',          'Chips, Nüsse & Schokolade',                                    5.50, 'Snacks',          70),
  ('Suppe des Tages',    'Hausgemachte Tagessuppe mit Brot',                              5.50, 'Warme Speisen',   80),
  ('Pasta Pomodoro',     'Penne mit frischer Tomatensoße & Parmesan',                    8.00, 'Warme Speisen',   90),
  ('Kaffee',             'Frisch gebrühter Filterkaffee',                                2.50, 'Getränke',       100),
  ('Cappuccino',         'Espresso mit aufgeschäumter Milch',                             3.00, 'Getränke',       110),
  ('Tee',                'Schwarztee, Grüntee oder Kräutertee',                           2.00, 'Getränke',       120),
  ('Orangensaft',        'Frisch gepresst (0,2l)',                                        3.50, 'Getränke',       130),
  ('Wasser',             'Still oder Sprudelnd (0,5l)',                                   1.50, 'Getränke',       140),
  ('Cola / Limo',        'Coca-Cola, Fanta oder Sprite (0,33l)',                         2.50, 'Getränke',       150),
  ('Bier',               'Deutsches Pils (0,5l)',                                         3.50, 'Getränke',       160),
  ('Wein',               'Haus-Rot- oder Weißwein (0,2l)',                               4.50, 'Getränke',       170)
ON CONFLICT DO NOTHING;
