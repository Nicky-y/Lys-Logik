-- One-time deployment step in the trusted Supabase SQL editor, after the
-- staff_access migration. Never run from the browser. No accounts are created
-- and no invitation is sent. Preserve Niclas' existing backoffice work role.
begin;
do $$
declare target uuid;
begin
  select s.user_id into strict target
    from public.staff_members s join auth.users u on u.id=s.user_id
    where lower(u.email)='mnbrom@gmail.com' and s.active;
  if not exists(select 1 from public.staff_members where user_id=target and is_owner) then
    perform public.bootstrap_staff_owner(target);
  end if;
end $$;
commit;
