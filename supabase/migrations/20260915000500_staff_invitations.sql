-- An invitation records an owner's intent. It grants no access until the
-- invited identity has confirmed its email and chosen a password in Auth.
create table public.staff_invitations (
  id uuid primary key,
  email text not null unique check (email=lower(btrim(email)) and length(email) between 3 and 254 and email !~ '[[:space:]]' and email ~ '^[^@]+@[^@]+\.[^@]+$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  role text check (role in ('backoffice','technical')),
  is_owner boolean not null,
  created_by uuid not null references public.staff_members(user_id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  state text not null check (state in ('sending','sent','uncertain','activated')),
  auth_user_id uuid unique references auth.users(id),
  attempt_id uuid not null,
  attempts integer not null default 1 check (attempts between 1 and 5),
  last_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  sent_at timestamptz,
  activated_at timestamptz,
  check ((state='activated') = (activated_at is not null)),
  check (state not in ('sent','activated') or auth_user_id is not null)
);
alter table public.staff_invitations enable row level security;
revoke all on public.staff_invitations from public,anon,authenticated;
grant select(id,email,display_name,role,is_owner,state,created_by,created_at,last_attempt_at,sent_at,activated_at) on public.staff_invitations to authenticated;
create policy owners_read_invitations on public.staff_invitations for select to authenticated using ((select public.is_owner()));

-- One record per external send attempt; its outcome is finalized once.
create table lys_private.staff_invitation_attempts (
  id uuid primary key,
  invitation_id uuid not null references public.staff_invitations(id),
  actor_id uuid not null references public.staff_members(user_id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text check (outcome in ('sent','uncertain'))
);
alter table lys_private.staff_invitation_attempts enable row level security;
revoke all on lys_private.staff_invitation_attempts from public,anon,authenticated;

create function lys_private.staff_invitation_receipt(p_inv public.staff_invitations) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p_inv.id,'email',p_inv.email,'display_name',p_inv.display_name,
    'role',p_inv.role,'is_owner',p_inv.is_owner,'state',p_inv.state,'created_by',p_inv.created_by,
    'created_at',p_inv.created_at,'last_attempt_at',p_inv.last_attempt_at,'sent_at',p_inv.sent_at,'activated_at',p_inv.activated_at);
$$;
revoke all on function lys_private.staff_invitation_receipt(public.staff_invitations) from public,anon,authenticated;

create function public.begin_staff_invitation(p_id uuid,p_email text,p_display_name text,p_role text,p_is_owner boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_name text; inv public.staff_invitations; attempt uuid:=gen_random_uuid(); normalized text:=lower(btrim(p_email));
begin
  -- Same lock order as access changes: owner revocation cannot interleave with reservation.
  perform pg_advisory_xact_lock(724513,1);
  select display_name into actor_name from public.staff_members where user_id=actor and active and is_owner for share;
  if not found then raise exception 'owner_required' using errcode='42501'; end if;
  if p_id is null or p_email is null or length(normalized) not between 3 and 254
    or normalized ~ '[[:space:]]' or normalized !~ '^[^@]+@[^@]+\.[^@]+$'
    or p_display_name is null or length(btrim(p_display_name)) not between 1 and 120
    or p_is_owner is null or (p_role is not null and p_role not in ('backoffice','technical'))
  then raise exception 'invalid_staff_invitation' using errcode='22023'; end if;
  select * into inv from public.staff_invitations where id=p_id for update;
  if found then
    if (inv.created_by,inv.email,inv.display_name,inv.role,inv.is_owner) is distinct from (actor,normalized,btrim(p_display_name),p_role,p_is_owner)
    then raise exception 'invitation_conflict' using errcode='22023'; end if;
    if inv.state in ('sent','activated') then
      return jsonb_build_object('invitation',lys_private.staff_invitation_receipt(inv),'attemptId',null);
    end if;
    if inv.lease_until>now() then raise exception 'invitation_busy' using errcode='55000'; end if;
    if inv.last_attempt_at>now()-interval '1 minute' then raise exception 'invitation_cooldown' using errcode='55000'; end if;
    if inv.attempts>=5 then raise exception 'invitation_limit' using errcode='54000'; end if;
  else
    if exists(select 1 from public.staff_invitations where email=normalized)
      or exists(select 1 from auth.users where lower(email)=normalized)
    then raise exception 'invitation_email_exists' using errcode='23505'; end if;
  end if;
  if (select count(*) from lys_private.staff_invitation_attempts where actor_id=actor and started_at>now()-interval '1 hour')>=10
    or (select count(*) from lys_private.staff_invitation_attempts where started_at>now()-interval '1 day')>=50
  then raise exception 'invitation_limit' using errcode='54000'; end if;
  if inv.id is null then
    insert into public.staff_invitations(id,email,display_name,role,is_owner,created_by,created_by_name,state,attempt_id,lease_until)
      values(p_id,normalized,btrim(p_display_name),p_role,p_is_owner,actor,actor_name,'sending',attempt,now()+interval '45 seconds') returning * into inv;
  else
    update public.staff_invitations set state='sending',attempt_id=attempt,attempts=attempts+1,last_attempt_at=now(),lease_until=now()+interval '45 seconds'
      where id=inv.id returning * into inv;
  end if;
  insert into lys_private.staff_invitation_attempts(id,invitation_id,actor_id) values(attempt,inv.id,actor);
  return jsonb_build_object('invitation',lys_private.staff_invitation_receipt(inv),'attemptId',attempt);
end $$;
revoke all on function public.begin_staff_invitation(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.begin_staff_invitation(uuid,text,text,text,boolean) to authenticated;

-- The browser cannot confirm delivery or bind an Auth identity. Only the server
-- can reconcile the invite with Auth's non-user-editable invited_at and email.
create function public.finish_staff_invitation(p_id uuid,p_attempt_id uuid,p_sent boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare inv public.staff_invitations; target uuid;
begin
  perform pg_advisory_xact_lock(724513,1);
  select * into inv from public.staff_invitations where id=p_id for update;
  if not found or p_attempt_id is null or inv.attempt_id<>p_attempt_id or p_sent is null then raise exception 'invitation_conflict'; end if;
  if inv.state in ('sent','uncertain','activated') then return lys_private.staff_invitation_receipt(inv); end if;
  select id into target from auth.users where lower(email)=inv.email and invited_at>=inv.created_at and created_at>=inv.created_at;
  if p_sent and target is null then raise exception 'invitation_identity_conflict'; end if;
  if inv.auth_user_id is not null and inv.auth_user_id is distinct from target then raise exception 'invitation_identity_conflict'; end if;
  update public.staff_invitations set state=case when p_sent then 'sent' else 'uncertain' end,
    auth_user_id=target,lease_until=null,sent_at=case when p_sent then now() else sent_at end
    where id=p_id returning * into inv;
  update lys_private.staff_invitation_attempts set finished_at=now(),outcome=case when p_sent then 'sent' else 'uncertain' end where id=p_attempt_id;
  return lys_private.staff_invitation_receipt(inv);
end $$;
revoke all on function public.finish_staff_invitation(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.finish_staff_invitation(uuid,uuid,boolean) to service_role;

create function public.activate_staff_invitation() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); inv public.staff_invitations; member public.staff_members; user_email text; confirmed timestamptz; password_set boolean;
begin
  if actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(724513,1);
  select * into member from public.staff_members where user_id=actor;
  if found then return null; end if; -- Never reactivate or overwrite an existing member.
  select * into inv from public.staff_invitations where auth_user_id=actor and state in ('sent','uncertain') for update;
  if not found then return null; end if;
  select lower(email),email_confirmed_at,coalesce(length(encrypted_password)>0,false) into user_email,confirmed,password_set from auth.users where id=actor for share;
  if user_email is distinct from inv.email or confirmed is null then raise exception 'invitation_identity_conflict' using errcode='42501'; end if;
  if not password_set then raise exception 'invitation_password_required' using errcode='42501'; end if;
  perform 1 from public.staff_members where user_id=inv.created_by and active and is_owner for share;
  if not found then raise exception 'invitation_owner_inactive' using errcode='42501'; end if;
  insert into public.staff_members(user_id,display_name,role,is_owner,active)
    values(actor,inv.display_name,inv.role,inv.is_owner,true) returning * into member;
  update public.staff_invitations set state='activated',activated_at=now() where id=inv.id;
  return to_jsonb(member);
end $$;
revoke all on function public.activate_staff_invitation() from public,anon,authenticated;
grant execute on function public.activate_staff_invitation() to authenticated;

comment on table public.staff_invitations is 'Owner-approved invitations. Immutable intended access, creator and activation evidence. No membership or last-owner protection is granted before verified activation.';
