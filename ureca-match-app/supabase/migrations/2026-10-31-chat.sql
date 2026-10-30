-- Chat between a student and a supervisor (REQ-CHAT-1..6, added after the SRS).
-- NOT applied automatically. Apply once in the Supabase SQL editor, or with `supabase db push`. Safe to run twice.
-- Then re-run policies.sql, so the new tables also get the policy that denies anon and authenticated clients.

-- REQ-CHAT-6. A value added to an enum cannot be used until this script has committed, and nothing below uses it.
alter type notification_event add value if not exists 'message_received';

create table if not exists conversations (
  id              text primary key,
  student_id      text not null references users(id) on delete cascade,
  supervisor_id   text not null references users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  unique (student_id, supervisor_id)                                  -- REQ-CHAT-2
);
create index if not exists conversations_supervisor_id_idx on conversations (supervisor_id);

create table if not exists messages (
  id              text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  sender_id       text not null references users(id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 2000),  -- REQ-CHAT-3, trimmed by the API
  created_at      timestamptz not null default now(),
  read            boolean not null default false                      -- REQ-CHAT-5
);
create index if not exists messages_conversation_id_created_at_idx on messages (conversation_id, created_at);
create index if not exists messages_unread on messages (conversation_id) where read = false;

-- Only the API (service role) reads or writes these.
alter table conversations enable row level security;
alter table messages enable row level security;
