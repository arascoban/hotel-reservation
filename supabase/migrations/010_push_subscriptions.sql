-- Push notification subscriptions (one row per browser/device)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only authenticated staff can subscribe / read subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users manage push subs"
  ON push_subscriptions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
