-- Persist cycles, rounds, matches, audit and verification codes.
-- NOT applied automatically. Apply once in the Supabase SQL editor, or with `supabase db push`.
-- Safe to run twice. Brings a database made from the previous schema.sql up to the current schema.sql.

alter table application_cycles add column if not exists rollover_unmatched boolean not null default true;  -- REQ-EXEC-3
alter table match_results add column if not exists supervisor_note text;                                   -- REQ-APPRV-2

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
