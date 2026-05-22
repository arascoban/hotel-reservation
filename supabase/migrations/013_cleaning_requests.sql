-- Cleaning requests submitted by guests via QR code
CREATE TABLE IF NOT EXISTS cleaning_requests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number    TEXT        NOT NULL,
  room_id        UUID        REFERENCES rooms(id) ON DELETE SET NULL,
  request_date   DATE        NOT NULL,                          -- day the guest wants cleaning
  time_preference TEXT       NOT NULL DEFAULT 'now',            -- 'now' | 'morning' | 'afternoon' | 'evening'
  status         TEXT        NOT NULL DEFAULT 'pending',        -- 'pending' | 'in_progress' | 'done'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One request per room per calendar day (pending or done)
CREATE UNIQUE INDEX IF NOT EXISTS cleaning_requests_room_date_idx
  ON cleaning_requests (room_number, request_date);

-- Row-level security: staff can read/update; anyone can insert (guests use anon key)
ALTER TABLE cleaning_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read cleaning requests"
  ON cleaning_requests FOR SELECT
  USING (true);

CREATE POLICY "guests insert cleaning request"
  ON cleaning_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "staff update cleaning request"
  ON cleaning_requests FOR UPDATE
  USING (true);
