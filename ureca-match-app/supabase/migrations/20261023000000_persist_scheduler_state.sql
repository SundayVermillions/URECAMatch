-- Persist cycles, rounds, matches, audit and verification codes (PR fix/supabase-persistence).
-- NOT applied automatically. Apply once in the Supabase SQL editor, or with `supabase db push`.
-- Safe to run twice. Brings a database made from the main-branch schema.sql up to the current schema.sql.

-- Slice D: the approval window (REQ-APPRV-4, 5). A value added to an enum cannot be used until this
-- script has committed, and nothing below uses it.
alter type round_status add value if not exists 'approval_window' before 'awaiting_publication';

alter table matching_rounds add column if not exists approval_end timestamptz;
-- Rows that exist already get a placeholder: two days after review closes. Correct it if a round has run.
update matching_rounds set approval_end = review_end + interval '2 days' where approval_end is null;
alter table matching_rounds alter column approval_end set not null;
do $$ begin
  alter table matching_rounds add constraint matching_rounds_approval_after_review check (review_end < approval_end);
exception when duplicate_object then null;
end $$;

alter table application_cycles add column if not exists rollover_unmatched boolean not null default true;  -- REQ-EXEC-3
alter table match_results add column if not exists supervisor_note text;                                   -- REQ-APPRV-2

-- REQ-AUDIT-3: the actor for actions the system takes on its own. Inactive, with no sign-in.
insert into users (id, email, name, role, status) values ('system', 'system@urecamatch.app', 'System', 'admin', 'inactive')
  on conflict (id) do nothing;

-- REQ-REG-2: the newest unused code for an account.
create index if not exists verification_codes_open on verification_codes (user_id, expires_at desc) where used = false;

-- REQ-PUB-1: publishing changes the offers and the applications' outcomes in one transaction, so an application
-- is only "matched" if its match row was saved with it. Called by the API (service role) only.
create or replace function publish_outcomes(p_matches jsonb, p_applications jsonb) returns void
language plpgsql as $$
declare changed int;
begin
  update match_results m set
    status           = (x->>'status')::match_status,
    published_at     = (x->>'published_at')::timestamptz,
    offer_expires_at = (x->>'offer_expires_at')::timestamptz
  from jsonb_array_elements(p_matches) x
  where m.id = x->>'id';
  get diagnostics changed = row_count;
  if changed <> jsonb_array_length(p_matches) then
    raise exception 'publish_outcomes: % of % matches found', changed, jsonb_array_length(p_matches);
  end if;

  update listing_applications a set status = (x->>'status')::application_status
  from jsonb_array_elements(p_applications) x
  where a.id = x->>'id';
  get diagnostics changed = row_count;
  if changed <> jsonb_array_length(p_applications) then
    raise exception 'publish_outcomes: % of % applications found', changed, jsonb_array_length(p_applications);
  end if;
end $$;
revoke all on function publish_outcomes(jsonb, jsonb) from public, anon, authenticated;
grant execute on function publish_outcomes(jsonb, jsonb) to service_role;
