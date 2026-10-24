-- Proposals can now be withdrawn: by the student, or automatically when the student is placed or can no longer be matched.
-- Run once in the Supabase SQL editor, on its own (a new enum value cannot be used in the same transaction that adds it).
-- Safe to run twice.
alter type proposal_status add value if not exists 'withdrawn';
