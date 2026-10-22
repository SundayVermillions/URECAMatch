-- Supervisor titles (Prof., Assoc. Prof., Asst. Prof., Dr.). Run once in the Supabase SQL editor, before deploying.
-- Safe to run twice. Fills the title from the start of each supervisor's name, which stays as it is.

alter table supervisor_profiles add column if not exists title text not null default '';

update supervisor_profiles sp
set title = case
  when u.name ilike 'Assoc. Prof. %' then 'Assoc. Prof.'
  when u.name ilike 'Asst. Prof. %' then 'Asst. Prof.'
  when u.name ilike 'Prof. %' then 'Prof.'
  when u.name ilike 'Dr. %' then 'Dr.'
  else ''
end
from users u
where u.id = sp.user_id and sp.title = '';
