# Hotel Reservation System — Technical Architecture

## Overview

A full-stack hotel reservation management web app built for a small hotel with 13 sellable room units. The system handles manual reservations and is designed to support iCal sync with Booking.com, Expedia, and Airbnb in a later phase.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Calendar UI | FullCalendar (resource timeline view) or custom grid |
| Auth | Supabase Auth (email/password for hotel staff) |
| Database | Supabase PostgreSQL |
| Backend logic | Next.js API Routes / Server Actions (TypeScript) |
| iCal (phase 2) | `node-ical` for parsing, custom generator for export |

---

## Project Structure

```
hotel-reservation/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                  ← Calendar dashboard
│   │   │   ├── reservations/
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── checkins/page.tsx         ← Today's arrivals
│   │   │   ├── checkouts/page.tsx        ← Today's departures
│   │   │   ├── unpaid/page.tsx
│   │   │   └── search/page.tsx
│   │   └── api/
│   │       ├── reservations/route.ts
│   │       └── ical/
│   │           ├── import/route.ts       ← phase 2
│   │           └── export/[roomId]/route.ts  ← phase 2
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                 ← browser client
│   │   │   └── server.ts                 ← server client
│   │   ├── reservations.ts              ← conflict detection helpers
│   │   └── ical.ts                       ← phase 2
│   └── types/
│       └── database.ts                   ← generated Supabase types
├── supabase/
│   ├── migrations/
│   │   ├── 001_schema.sql
│   │   ├── 002_functions.sql
│   │   └── 003_rls.sql
│   └── seed.sql
└── docs/
    └── architecture.md
```

---

## Database Architecture

### MVP Model (Phase 1)

Each sellable room unit is one row in the `rooms` table. The `room_types` table defines the category, capacity, and display rules. Reservations reference a `room_id` directly.

```
room_types (1) ──< rooms (13) ──< reservations (N)
                                       │
                                       └──> guests (N)
```

### Future Model (Phase 2 — Physical Rooms)

Family units consist of two physical rooms. When a family unit is reserved, all linked physical rooms are blocked.

```
room_types ──< rooms (bookable units) ──< bookable_unit_physical_rooms >──> physical_rooms
```

The `rooms` table keeps its current role as the sellable calendar unit. Physical rooms are tracked separately and can be blocked automatically via triggers or application logic.

---

## Conflict Detection Strategy (Defense in Depth)

Conflicts are prevented at three layers:

### Layer 1 — PostgreSQL EXCLUDE Constraint (strongest)

Uses the `btree_gist` extension and a range exclusion constraint on the `reservations` table. This is atomic and race-condition-safe.

```sql
EXCLUDE USING gist (
  room_id WITH =,
  tstzrange(checkin_at, checkout_at, '[)') WITH &&
) WHERE (status NOT IN ('cancelled', 'no_show'))
```

The `[)` range (inclusive start, exclusive end) correctly allows same-day checkout + checkin (11:00 out, 15:00 in).

### Layer 2 — Supabase RPC Function

A `create_reservation` function that validates capacity, checks dates, creates or reuses a guest record, and inserts the reservation in a single transaction. Returns structured errors.

### Layer 3 — TypeScript + Frontend

A `checkOverlap` helper queries existing reservations before showing the form. The form also validates guest count against room capacity before submission.

---

## Reservation Color Coding

| Source | Color |
|---|---|
| Booking.com | Blue |
| Expedia | Purple |
| Airbnb | Red |
| Walk-in | Green |
| Phone | Yellow |
| Website | Orange |
| Other | Gray |

Cancelled reservations are shown in muted gray or hidden (toggled by filter).

---

## iCal Sync (Phase 2 Design)

### Import flow

```
Cron job / manual trigger
  → fetch iCal URL (sync_feeds)
  → parse VEVENT blocks
  → for each event:
      if external_id already exists → update if changed
      else → insert as reservation (source = platform, status = confirmed)
      if conflict with manual reservation → log warning, skip
  → write sync_log entry
```

### Export flow

```
GET /api/ical/export/[roomId]
  → query all active reservations for room
  → generate iCal VCALENDAR with one VEVENT per reservation
  → return text/calendar response
```

Each room's export URL can be registered in Booking.com, Expedia, and Airbnb as an "external calendar" to block availability automatically.

---

## Auth & Access Control

- Supabase Auth with email/password.
- All routes require an authenticated session (middleware redirect to `/login`).
- Row Level Security (RLS) on all tables: authenticated users can read/write.
- Future: role-based access (admin vs. receptionist) via a `staff_profiles` table.

---

## Room Capacity Rules

| Guest Count | Eligible Room Types |
|---|---|
| 1 | Single, Double, Double+Sofa, Family |
| 2 | Double, Double+Sofa, Family |
| 3 | Double+Sofa (max 3), Family |
| 4 | Family with double second room only |

Guest count is validated against `rooms.max_capacity` at the database level in the RPC function.
