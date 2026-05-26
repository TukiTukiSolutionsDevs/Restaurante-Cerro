CREATE TABLE IF NOT EXISTS "menu_session" (
  "id"                  bigserial PRIMARY KEY,
  "daily_menu_id"       bigint NOT NULL REFERENCES "daily_menu"("id") ON DELETE RESTRICT,
  "shift_number"        integer NOT NULL,
  "opened_at"           timestamptz NOT NULL DEFAULT now(),
  "closed_at"           timestamptz,
  "opened_by_actor_id"  bigint NOT NULL REFERENCES "staff_user"("id") ON DELETE RESTRICT,
  "closed_by_actor_id"  bigint REFERENCES "staff_user"("id") ON DELETE RESTRICT,
  "notes"               text,
  CONSTRAINT "menu_session_shift_positive" CHECK ("shift_number" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "menu_session_daily_shift_idx"
  ON "menu_session" ("daily_menu_id", "shift_number");
