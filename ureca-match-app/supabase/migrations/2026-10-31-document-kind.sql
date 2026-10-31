-- A student's documents are either their transcript or supporting documents, and a student has at most one transcript (REQ-PROF-3).
-- Matches schema.sql. Run once in the Supabase SQL editor. Safe to run twice. Live already has it.
alter table supporting_documents add column if not exists kind text not null default 'supporting'
  check (kind in ('transcript', 'supporting'));

-- Seeded transcripts are named doc-stu-<n>-t.
update supporting_documents set kind = 'transcript' where id like 'doc-stu-%-t';

create unique index if not exists one_transcript_per_student on supporting_documents (owner_id) where kind = 'transcript';
