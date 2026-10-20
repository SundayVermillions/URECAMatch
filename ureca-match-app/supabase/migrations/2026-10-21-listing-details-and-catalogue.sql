-- Bring an existing database up to date with schema.sql (run once in the Supabase SQL editor).
-- Safe to run twice. After it, run supabase/seed.sql to fill the topics and courses tables.

-- Project details on listings (supervisor form, project page)
alter table project_listings add column if not exists outcomes       text not null default '';
alter table project_listings add column if not exists skills         text not null default '';
alter table project_listings add column if not exists hours_per_week int check (hours_per_week between 1 and 40);
alter table project_listings add column if not exists mode           text check (mode in ('on_site', 'hybrid', 'remote'));
alter table project_listings add column if not exists gallery_urls   text[] not null default '{}';
alter table project_listings add column if not exists video_url      text;

-- Reference lists for the topic and course pickers
create table if not exists topics (
  name        text primary key,
  topic_group text not null
);
create table if not exists courses (
  code         text primary key,
  title        text not null,
  au           numeric,
  dept         text not null default '',
  last_offered text not null default ''
);
alter table topics  enable row level security;
alter table courses enable row level security;
