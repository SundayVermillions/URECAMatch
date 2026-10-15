-- URECAMatch schema. Entities follow the SRS class diagram (Appendix B) and data dictionary (Appendix A).
-- Apply with:  supabase db push   or paste into the Supabase SQL editor.
-- The API talks to these tables with the service-role key; RLS is enabled so the anon key sees nothing.

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ enums
create type role as enum ('student', 'supervisor', 'admin');
create type account_status as enum ('pending_verification', 'active', 'inactive');
create type cycle_status as enum ('draft', 'pre_application', 'in_progress', 'closed');
create type round_status as enum ('scheduled', 'application_window', 'review_window', 'awaiting_publication', 'published', 'completed');
create type listing_status as enum ('draft', 'published', 'closed');
create type application_status as enum ('submitted', 'withdrawn', 'matched', 'unmatched');
create type proposal_status as enum ('submitted', 'accepted', 'declined');
create type match_status as enum ('proposed', 'approved', 'rejected', 'reassigned', 'published', 'accepted', 'declined', 'timed_out');
create type notification_event as enum ('cycle_changed', 'round_opened', 'results_published', 'offer_received', 'proposal_decided', 'matches_proposed', 'match_approved', 'match_rejected', 'account_changed');
create type audit_operation as enum ('matching_executed', 'manual_reassignment', 'results_published', 'user_updated', 'user_deactivated', 'cycle_updated');

-- ------------------------------------------------------------------ users (slice A)
-- id matches auth.users.id when the account is created through Supabase Auth.
create table users (
  id            text primary key,
  email         text not null unique,
  name          text not null,
  role          role not null,
  status        account_status not null default 'pending_verification',
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table student_profiles (
  user_id               text primary key references users(id) on delete cascade,
  school                text not null default '',
  cgpa                  numeric(3,2) check (cgpa between 0 and 5),
  year_of_study         int check (year_of_study between 1 and 5),
  completed_modules     text[] not null default '{}',
  research_interests    text[] not null default '{}',
  profile_complete      boolean not null default false,          -- REQ-PROF-1
  eligible_for_matching boolean not null default true            -- REQ-OUTCOME-2, 4
);

create table supervisor_profiles (
  user_id      text primary key references users(id) on delete cascade,
  faculty      text not null default '',
  organisation text not null default 'NTU'
);

create table verification_codes (                                 -- REQ-REG-2
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references users(id) on delete cascade,
  code       text not null,
  expires_at timestamptz not null,
  used       boolean not null default false
);

create table supporting_documents (                              -- REQ-PROF-3
  id           text primary key,
  owner_id     text not null references users(id) on delete cascade,
  file_name    text not null,
  file_format  text not null default 'pdf',
  file_size    int  not null check (file_size <= 5242880),
  storage_path text,
  uploaded_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------ cycle and rounds (slice D)
create table application_cycles (
  id                   text primary key,
  academic_year        text not null,
  opening_date         timestamptz not null,
  closing_date         timestamptz not null check (closing_date > opening_date),
  pre_application_days int not null default 7,
  status               cycle_status not null default 'draft'
);

create table matching_rounds (
  id                text primary key,
  cycle_id          text not null references application_cycles(id) on delete cascade,
  number            int  not null check (number between 1 and 3),   -- REQ-ROUND-1
  application_start timestamptz not null,
  application_end   timestamptz not null,
  review_start      timestamptz not null,
  review_end        timestamptz not null,
  status            round_status not null default 'scheduled',
  executed_at       timestamptz,                                    -- REQ-EXEC-2: set once
  published_at      timestamptz,
  unique (cycle_id, number),
  check (application_start < application_end and application_end < review_start and review_start < review_end)
);

-- ------------------------------------------------------------------ listings (slice B)
create table project_listings (
  id                text primary key,
  supervisor_id     text not null references users(id),
  title             text not null,
  description       text not null,
  prerequisites     text[] not null default '{}',
  topic_tags        text[] not null default '{}',
  available_slots   int  not null check (available_slots >= 1),
  filled_slots      int  not null default 0 check (filled_slots <= available_slots),  -- REQ-PROJ-3
  offering_faculty  text not null,
  research_location text not null default '',
  cover_url         text,
  status            listing_status not null default 'draft',
  created_at        timestamptz not null default now()
);
create index on project_listings (status);
create index on project_listings using gin (topic_tags);

-- ------------------------------------------------------------------ applications and rankings (slice C)
create table listing_applications (
  id              text primary key,
  student_id      text not null references users(id),
  listing_id      text not null references project_listings(id),
  round_id        text not null references matching_rounds(id),
  statement       text not null check (length(statement) >= 50),   -- REQ-APPLY-2
  submitted_at    timestamptz not null default now(),
  preference_rank int,
  status          application_status not null default 'submitted',
  document_ids    text[] not null default '{}',
  unique (student_id, listing_id, round_id)
);
-- REQ-SRANK-2: one rank per student per round
create unique index preference_rank_unique
  on listing_applications (student_id, round_id, preference_rank)
  where status = 'submitted' and preference_rank is not null;

create table applicant_rankings (                                  -- REQ-VRANK-2
  listing_id      text not null references project_listings(id),
  round_id        text not null references matching_rounds(id),
  application_ids text[] not null default '{}',
  submitted_at    timestamptz,
  primary key (listing_id, round_id)
);

create table self_proposed_applications (                          -- REQ-PROPOSE-1..3
  id                 text primary key,
  student_id         text not null references users(id),
  supervisor_id      text not null references users(id),
  title              text not null,
  description        text not null,
  research_interests text[] not null default '{}',
  statement          text not null,
  status             proposal_status not null default 'submitted',
  submitted_at       timestamptz not null default now(),
  decided_at         timestamptz,
  document_ids       text[] not null default '{}'
);

-- ------------------------------------------------------------------ matching (slice D)
create table match_results (
  id                    text primary key,
  round_id              text not null references matching_rounds(id),
  student_id            text not null references users(id),
  listing_id            text not null references project_listings(id),
  status                match_status not null default 'proposed',
  preference_rank       int,
  supervisor_decided_at timestamptz,
  published_at          timestamptz,
  offer_expires_at      timestamptz,                                -- REQ-OUTCOME-3
  student_responded_at  timestamptz,
  original_listing_id   text references project_listings(id),      -- REQ-ASSIGN-1
  justification         text,                                      -- REQ-ASSIGN-2
  supervisor_note       text,                                      -- REQ-APPRV-2
  unique (round_id, student_id)
);

-- ------------------------------------------------------------------ notifications (slice E)
create table notifications (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  event      notification_event not null,
  title      text not null,
  message    text not null,
  created_at timestamptz not null default now(),
  read       boolean not null default false,
  link       text
);
create index on notifications (user_id, created_at desc);          -- REQ-NOTIF-1

-- ------------------------------------------------------------------ audit (append only)
create table audit_log (
  id               text primary key,
  operation        audit_operation not null,
  actor_id         text not null references users(id),
  timestamp        timestamptz not null default now(),
  affected_records text[] not null default '{}',
  note             text
);

-- REQ-AUDIT-2: nobody, including the service role, can update or delete audit rows.
create or replace function audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();

-- ------------------------------------------------------------------ RLS: the anon key sees nothing; the API uses the service role.
do $$ declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ storage buckets (run once; policies in policies.sql)
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('covers', 'covers', true) on conflict do nothing;
