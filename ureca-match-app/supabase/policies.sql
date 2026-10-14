-- URECAMatch access policies. Run after schema.sql and before seed.sql. Safe to run more than once.
--
-- How the app reaches Supabase
--   Only the FastAPI app talks to Supabase, with the service-role key (api/app/db/store.py,
--   api/app/services/storage.py). The service role bypasses RLS. The web app never holds a
--   Supabase key: every read and write goes through the API, which checks the caller's role
--   in the routers (deps.require_role). So anon and authenticated clients get no direct access.
--
-- 1. Tables (public schema)
--    RLS is on for every table, plus one restrictive policy per table that denies anon and
--    authenticated. With no permissive policy that already means "deny"; the restrictive
--    policy keeps it denied even if someone later adds a permissive one by mistake.
--    SRS 5.3.2: every request is authorised against the user's role, and only the API does that.
--    SRS 5.3.3: CGPA, modules and documents are only disclosed through the API to admins and
--    the supervisors entitled to see them, never read straight from the database.
--
-- 2. Bucket `documents` (private): student transcripts and CVs (REQ-PROF-3)
--    No direct select, insert, update or delete for anon or authenticated. The API uploads with
--    the service role and hands out a signed URL that expires in 10 minutes
--    (api/app/routers/rankings.py). Signed URLs are checked by Storage itself, not by RLS.
--    SRS 5.3.3: supporting documents are personal data and only go to entitled viewers.
--    SRS 5.3.2: only the owner, an admin, or the supervisor of a listing the student applied to
--    (checked in the API, REQ-VRANK-3) can get a link.
--
-- 3. Bucket `covers` (public): listing cover images
--    Anyone can read through the public URL (/storage/v1/object/public/covers/...), which
--    Storage serves without RLS, so no select policy is needed. Insert, update and delete are
--    denied for anon and authenticated; only the API uploads, after checking the user owns the
--    listing (api/app/routers/listings.py).
--    SRS 5.3.2: only the listing's supervisor can change its cover.
--
-- RLS on storage.objects is on by default in Supabase and the table is owned by Storage,
-- so this script only adds policies there and does not alter the table.

-- ------------------------------------------------------------------ tables: deny direct client access
do $$ declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_no_client_access', t);
    execute format(
      'create policy %I on %I as restrictive for all to anon, authenticated using (false) with check (false)',
      t || '_no_client_access', t
    );
  end loop;
end $$;

-- ------------------------------------------------------------------ buckets: keep the public flag as the code expects
update storage.buckets set public = false where id = 'documents';
update storage.buckets set public = true where id = 'covers';

-- ------------------------------------------------------------------ documents: no direct client access
drop policy if exists documents_no_client_access on storage.objects;
create policy documents_no_client_access on storage.objects
  as restrictive for all to anon, authenticated
  using (bucket_id <> 'documents')
  with check (bucket_id <> 'documents');

-- ------------------------------------------------------------------ covers: public read via URL, writes only via the API
drop policy if exists covers_no_client_insert on storage.objects;
create policy covers_no_client_insert on storage.objects
  as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'covers');

drop policy if exists covers_no_client_update on storage.objects;
create policy covers_no_client_update on storage.objects
  as restrictive for update to anon, authenticated
  using (bucket_id <> 'covers')
  with check (bucket_id <> 'covers');

drop policy if exists covers_no_client_delete on storage.objects;
create policy covers_no_client_delete on storage.objects
  as restrictive for delete to anon, authenticated
  using (bucket_id <> 'covers');
