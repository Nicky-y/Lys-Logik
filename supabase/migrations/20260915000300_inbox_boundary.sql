-- 'new' is the first-contact inbox. A processed or archived enquiry cannot become new again.
-- Existing transitions out of 'new' remain compatible with earlier app versions.
create function lys_private.guard_inbox_boundary()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'new' and new.status = 'new' then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function lys_private.guard_inbox_boundary() from public, anon, authenticated;
create trigger leads_inbox_boundary before update of status on public.leads
for each row execute function lys_private.guard_inbox_boundary();
comment on function lys_private.guard_inbox_boundary() is
  'Inbox membership ends when a new enquiry is processed or archived. Status updates remain atomic with staff command receipts and history; replies and notes do not reset membership.';
create index leads_newest_inbox_idx on public.leads(created_at desc, id) where status = 'new';
