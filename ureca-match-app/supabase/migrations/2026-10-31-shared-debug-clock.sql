-- Shared fake clock for demos (DEBUG_CLOCK=true). One row. Every API process reads it, so everyone sees the same time.
-- NOT applied automatically. Apply once in the Supabase SQL editor. Safe to run twice.
create table if not exists app_clock (
  id          int primary key default 1 check (id = 1),
  override_at timestamptz                       -- null means the real clock
);
insert into app_clock (id, override_at) values (1, null) on conflict (id) do nothing;

alter table app_clock enable row level security;
drop policy if exists app_clock_no_client_access on app_clock;
create policy app_clock_no_client_access on app_clock as restrictive for all to anon, authenticated using (false) with check (false);
