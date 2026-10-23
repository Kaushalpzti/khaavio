-- OPTIONAL AND DESTRUCTIVE: use only if Khaavio should have ONE platform admin.
-- The visible Supabase Auth screenshot identified the primary account as Hacker KD with this UID:
-- bfb997b2-e56e-4a80-aa3c-b2870ae18c6b
-- VERIFY this is your own current Auth > Users UID before running.
-- The DELETE below revokes platform-admin access for every other UID in platform_admins.

select user_id, created_at
from public.platform_admins
order by created_at;

begin;

insert into public.platform_admins (user_id)
values ('bfb997b2-e56e-4a80-aa3c-b2870ae18c6b'::uuid)
on conflict (user_id) do nothing;

delete from public.platform_admins
where user_id <> 'bfb997b2-e56e-4a80-aa3c-b2870ae18c6b'::uuid;

commit;

select user_id, created_at
from public.platform_admins
order by created_at;
