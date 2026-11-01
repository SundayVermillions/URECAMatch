-- Each project's AI match weights (REQ-VRANK-5). Null means the defaults.

alter table project_listings add column if not exists score_weights jsonb;
