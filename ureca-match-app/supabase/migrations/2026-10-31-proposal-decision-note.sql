-- A supervisor who declines a student's proposal now gives a reason, and the student reads it (REQ-REVPROP-2).
-- Run once in the Supabase SQL editor. Safe to run twice. Existing proposals keep an empty note.
alter table self_proposed_applications add column if not exists decision_note text;
