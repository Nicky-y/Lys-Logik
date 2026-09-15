-- Ownership and work role are independent. Existing work roles are preserved;
-- nobody becomes an owner implicitly. First ownership is provisioned server-side.
alter table public.staff_members
  alter column role drop not null,
  alter column role drop default,
  add column is_owner boolean not null default false,
  add column access_version integer not null default 1 check (access_version > 0);

create function public.is_owner() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.staff_members where user_id=auth.uid() and active and is_owner);
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.staff_members where user_id=auth.uid() and active and role in ('backoffice','technical'));
$$;
revoke all on function public.is_owner() from public,anon,authenticated;
grant execute on function public.is_owner() to authenticated;

drop policy staff_read_members on public.staff_members;
create policy staff_read_members on public.staff_members for select to authenticated
  using ((user_id=auth.uid() and active) or (select public.is_owner()));

create table public.staff_access_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.staff_members(user_id),
  actor_id uuid references public.staff_members(user_id),
  actor_name text not null,
  access_version integer not null check (access_version > 1),
  before_access jsonb not null,
  after_access jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id,access_version)
);
alter table public.staff_access_events enable row level security;
revoke all on public.staff_access_events from public,anon,authenticated;
grant select on public.staff_access_events to authenticated;
create policy owners_read_staff_events on public.staff_access_events for select to authenticated
  using ((select public.is_owner()));

create function lys_private.guard_staff_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(724513,1);
  if (old.role,old.is_owner,old.active) is not distinct from (new.role,new.is_owner,new.active) then
    new.access_version := old.access_version;
    return new;
  end if;
  if old.is_owner and old.active and not (new.is_owner and new.active)
    and not exists(select 1 from public.staff_members where user_id<>old.user_id and active and is_owner)
  then raise exception 'last_owner_required' using errcode='22023'; end if;
  new.access_version := old.access_version+1;
  return new;
end $$;
create trigger guard_staff_access before update on public.staff_members
  for each row execute function lys_private.guard_staff_access();

create function lys_private.record_staff_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.access_version<>old.access_version then
    insert into public.staff_access_events(user_id,actor_id,actor_name,access_version,before_access,after_access)
      values(new.user_id,auth.uid(),coalesce((select display_name from public.staff_members where user_id=auth.uid()),'Systemadministrator'),new.access_version,
        jsonb_build_object('role',old.role,'isOwner',old.is_owner,'active',old.active),
        jsonb_build_object('role',new.role,'isOwner',new.is_owner,'active',new.active));
  end if;
  return new;
end $$;
create trigger record_staff_access after update on public.staff_members
  for each row execute function lys_private.record_staff_access();
revoke all on function lys_private.guard_staff_access(),lys_private.record_staff_access() from public,anon,authenticated;

create table lys_private.staff_access_commands (
  command_id uuid primary key,
  actor_id uuid not null references public.staff_members(user_id),
  payload jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default now()
);
alter table lys_private.staff_access_commands enable row level security;
revoke all on lys_private.staff_access_commands from public,anon,authenticated;

create function public.set_staff_access(p_command_id uuid,p_user_id uuid,p_expected_version integer,p_role text,p_is_owner boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  member public.staff_members;
  prior lys_private.staff_access_commands;
  payload jsonb := jsonb_build_object('userId',p_user_id,'expectedVersion',p_expected_version,'role',p_role,'isOwner',p_is_owner);
  receipt jsonb;
begin
  -- Serialize ownership changes before taking member locks, including self-demotion.
  perform pg_advisory_xact_lock(724513,1);
  perform 1 from public.staff_members where user_id=actor and active and is_owner for share;
  if not found then raise exception 'owner_required' using errcode='42501'; end if;
  if p_command_id is null or p_user_id is null or p_expected_version is null or p_expected_version<1
    or p_is_owner is null or (p_role is not null and p_role not in ('backoffice','technical'))
  then raise exception 'invalid_staff_access' using errcode='22023'; end if;
  select * into prior from lys_private.staff_access_commands where command_id=p_command_id;
  if found then
    if prior.actor_id<>actor or prior.payload is distinct from payload then
      raise exception 'command_conflict' using errcode='22023';
    end if;
    return prior.receipt;
  end if;
  select * into member from public.staff_members where user_id=p_user_id for update;
  if not found then raise exception 'staff_not_found' using errcode='P0002'; end if;
  if member.access_version<>p_expected_version then raise exception 'staff_version_conflict' using errcode='40001'; end if;
  if (member.role,member.is_owner) is not distinct from (p_role,p_is_owner) then raise exception 'no_change' using errcode='22023'; end if;
  update public.staff_members set role=p_role,is_owner=p_is_owner where user_id=p_user_id returning * into member;
  select jsonb_build_object('userId',member.user_id,'version',member.access_version,'eventId',id) into receipt
    from public.staff_access_events where user_id=member.user_id and access_version=member.access_version;
  insert into lys_private.staff_access_commands(command_id,actor_id,payload,receipt) values(p_command_id,actor,payload,receipt);
  return receipt;
end $$;
revoke all on function public.set_staff_access(uuid,uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.set_staff_access(uuid,uuid,integer,text,boolean) to authenticated;

-- Only a trusted administrator can establish the first owner. No email or user
-- metadata is promoted automatically, and the existing work role is untouched.
create function public.bootstrap_staff_owner(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(724513,1);
  if exists(select 1 from public.staff_members where active and is_owner) then raise exception 'owner_already_exists'; end if;
  update public.staff_members set is_owner=true where user_id=p_user_id and active;
  if not found then raise exception 'staff_not_found'; end if;
end $$;
revoke all on function public.bootstrap_staff_owner(uuid) from public,anon,authenticated;
grant execute on function public.bootstrap_staff_owner(uuid) to service_role;

comment on column public.staff_members.role is 'Nullable work role from the fixed supported list. Null grants no customer, calendar, mail, technical-review or push access.';
comment on column public.staff_members.is_owner is 'Independent employee-administration permission; never implies a work role.';
comment on function public.set_staff_access(uuid,uuid,integer,text,boolean) is 'Active owners only. Versioned, idempotent access change with immutable before/after evidence. Preserves at least one active owner.';


-- Preserve the existing workflow; require a work role at its server boundary.
create or replace function lys_private.execute_staff_command(
  p_command_id uuid,p_lead_id uuid,p_expected_version integer,p_kind text,p_input jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  actor_label text;
  actor_role text;
  saved public.leads;
  previous lys_private.staff_commands;
  command_payload jsonb := jsonb_build_object('expectedVersion',p_expected_version,'input',p_input);
  old_status public.lead_status;
  target public.lead_status;
  event_kind text;
  event_body text;
  event_details jsonb := '{}'::jsonb;
  event_id uuid := gen_random_uuid();
  receipt jsonb;
  next_waiting text;
  decision text;
  booking public.appointments;
  previous_booking jsonb;
  starts timestamptz;
  ends timestamptz;
  booking_title text;
  booking_location text;
begin
  if actor is null then raise exception 'staff_required' using errcode='42501'; end if;
  if p_command_id is null or p_lead_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'invalid_command' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,1));
  -- A concurrent revocation cannot pass between this check and the commit.
  select display_name,role into actor_label,actor_role from public.staff_members where user_id=actor and active and role in ('backoffice','technical') for share;
  if not found then raise exception 'staff_required' using errcode='42501'; end if;
  select * into previous from lys_private.staff_commands where command_id=p_command_id;
  if found then
    if previous.actor_id<>actor or previous.lead_id<>p_lead_id or previous.kind<>p_kind or previous.payload is distinct from command_payload then
      raise exception 'command_conflict' using errcode='22023';
    end if;
    return previous.receipt;
  end if;
  select * into saved from public.leads where id=p_lead_id for update;
  if not found then raise exception 'lead_not_found' using errcode='P0002'; end if;
  if saved.version<>p_expected_version then raise exception 'lead_version_conflict' using errcode='40001'; end if;
  old_status := saved.status;

  case p_kind
  when 'status' then
    target := (p_input->>'status')::public.lead_status;
    event_body := nullif(btrim(p_input->>'reason'),'');
    if target is null or char_length(event_body)>1000 then raise exception 'invalid_status' using errcode='22023'; end if;
    if target='scheduled' then raise exception 'appointment_required' using errcode='22023'; end if;
    if target in ('completed','invoiced','paid') then raise exception 'workflow_not_ready' using errcode='22023'; end if;
    if not (
      (old_status='new' and target in ('clarifying','qualified','rejected','outside_scope','cancelled')) or
      (old_status='clarifying' and target in ('new','qualified','rejected','outside_scope','cancelled')) or
      (old_status='qualified' and target in ('clarifying','rejected','outside_scope','cancelled')) or
      (old_status in ('rejected','outside_scope','cancelled') and target='clarifying') or
      (old_status='scheduled' and target in ('clarifying','cancelled'))
    ) then raise exception 'invalid_transition' using errcode='22023'; end if;
    if (target in ('rejected','outside_scope','cancelled') or old_status in ('rejected','outside_scope','cancelled'))
      and (event_body is null or char_length(event_body)<3) then raise exception 'reason_required' using errcode='22023'; end if;
    if old_status='scheduled' and target in ('clarifying','cancelled') then
      if event_body is null or char_length(event_body)<3 then raise exception 'reason_required' using errcode='22023'; end if;
      select * into booking from public.appointments where lead_id=saved.id and state='booked' for update;
      if not found then raise exception 'appointment_not_found' using errcode='22023'; end if;
      previous_booking := to_jsonb(booking);
      update public.appointments set state='cancelled',updated_at=now() where id=booking.id returning * into booking;
      event_details := jsonb_build_object('appointmentBefore',previous_booking,'appointmentAfter',to_jsonb(booking));
    end if;
    if target='qualified' and saved.review_decision<>'approved' then raise exception 'review_required' using errcode='22023'; end if;
    saved.status := target;
    saved.waiting_on := case when target='clarifying' then 'staff' else null end;
    event_kind := 'status_changed';
  when 'waiting' then
    next_waiting := p_input->>'waitingOn';
    if saved.status<>'clarifying' or (next_waiting is not null and next_waiting not in ('staff','customer')) then
      raise exception 'invalid_waiting_state' using errcode='22023';
    end if;
    if saved.waiting_on is not distinct from next_waiting then raise exception 'no_change' using errcode='22023'; end if;
    event_details := jsonb_build_object('from',saved.waiting_on,'to',next_waiting);
    saved.waiting_on := next_waiting;
    event_kind := 'waiting_changed';
  when 'review' then
    if actor_role is distinct from 'technical' then raise exception 'reviewer_required' using errcode='42501'; end if;
    decision := p_input->>'decision';
    event_body := btrim(p_input->>'summary');
    if decision is null or decision not in ('approved','declined') or event_body is null or char_length(event_body) not between 10 and 2000 then
      raise exception 'invalid_review' using errcode='22023';
    end if;
    if saved.status not in ('new','clarifying','qualified') then raise exception 'invalid_review_state' using errcode='22023'; end if;
    if saved.status='qualified' and decision='declined' then raise exception 'return_to_clarifying' using errcode='22023'; end if;
    event_details := jsonb_build_object('from',saved.review_decision,'to',decision);
    saved.review_decision := decision; saved.review_summary := event_body;
    saved.reviewed_by := actor; saved.reviewed_at := now();
    event_kind := 'review_recorded';
  when 'appointment_create','appointment_reschedule','appointment_cancel' then
    if p_kind='appointment_create' then
      if saved.status<>'qualified' or saved.review_decision<>'approved' then raise exception 'appointment_qualification_required' using errcode='22023'; end if;
    else
      if saved.status<>'scheduled' then raise exception 'appointment_not_found' using errcode='22023'; end if;
      select * into booking from public.appointments where id=(p_input->>'appointmentId')::uuid and lead_id=saved.id and state='booked' for update;
      if not found then raise exception 'appointment_not_found' using errcode='22023'; end if;
      previous_booking := to_jsonb(booking);
      event_body := btrim(p_input->>'reason');
      if event_body is null or char_length(event_body) not between 3 and 1000 then raise exception 'reason_required' using errcode='22023'; end if;
    end if;
    if p_kind<>'appointment_cancel' then
      booking_title := btrim(p_input->>'title');
      booking_location := btrim(p_input->>'location');
      if booking_title is null or char_length(booking_title) not between 3 and 160 or booking_location is null or char_length(booking_location)>300 then raise exception 'invalid_appointment' using errcode='22023'; end if;
      if p_input->>'startsAt' is null or p_input->>'endsAt' is null
        or (p_input->>'startsAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
        or (p_input->>'endsAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
      then raise exception 'invalid_appointment_time' using errcode='22023'; end if;
      starts := (p_input->>'startsAt')::timestamptz; ends := (p_input->>'endsAt')::timestamptz;
      if not isfinite(starts) or not isfinite(ends) or starts<'2020-01-01T00:00:00Z'::timestamptz or ends>='2101-01-01T00:00:00Z'::timestamptz or ends-starts not between interval '1 minute' and interval '24 hours' then
        raise exception 'invalid_appointment_time' using errcode='22023';
      end if;
    end if;
    case p_kind
      when 'appointment_create' then
        insert into public.appointments(lead_id,title,location,starts_at,ends_at)
          values(saved.id,booking_title,booking_location,starts,ends) returning * into booking;
        saved.status := 'scheduled'; saved.waiting_on := null; event_kind := 'appointment_created';
      when 'appointment_reschedule' then
        if booking.title=booking_title and booking.location=booking_location and booking.starts_at=starts and booking.ends_at=ends then raise exception 'no_change' using errcode='22023'; end if;
        update public.appointments set title=booking_title,location=booking_location,starts_at=starts,ends_at=ends,updated_at=now() where id=booking.id returning * into booking;
        event_kind := 'appointment_rescheduled';
      when 'appointment_cancel' then
        update public.appointments set state='cancelled',updated_at=now() where id=booking.id returning * into booking;
        saved.status := 'clarifying'; saved.waiting_on := 'staff'; event_kind := 'appointment_cancelled';
    end case;
    event_details := jsonb_build_object('appointmentBefore',previous_booking,'appointmentAfter',to_jsonb(booking));
  when 'note' then
    event_body := btrim(p_input->>'body');
    if event_body is null or char_length(event_body) not between 3 and 3000 then raise exception 'invalid_note' using errcode='22023'; end if;
    event_kind := 'note_added';
  else raise exception 'invalid_command' using errcode='22023';
  end case;

  update public.leads set status=saved.status,waiting_on=saved.waiting_on,
    review_decision=saved.review_decision,review_summary=saved.review_summary,
    reviewed_by=saved.reviewed_by,reviewed_at=saved.reviewed_at,
    version=saved.version+1,updated_at=now() where id=saved.id returning * into saved;
  insert into public.lead_events(id,lead_id,event_type,actor_type,actor_id,actor_name,lead_version,from_status,to_status,body,details)
    values(event_id,saved.id,event_kind,'staff',actor,actor_label,saved.version,old_status,saved.status,event_body,event_details);
  receipt := jsonb_build_object('leadId',saved.id,'version',saved.version,'eventId',event_id);
  insert into lys_private.staff_commands(command_id,actor_id,lead_id,kind,payload,receipt)
    values(p_command_id,actor,saved.id,p_kind,command_payload,receipt);
  return receipt;
end;
$$;


-- Preserve the existing workflow; require a work role at its server boundary.
create or replace function public.queue_customer_message(p_id uuid,p_lead_id uuid,p_subject text,p_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); prior public.lead_messages; customer public.leads; cfg lys_private.mail_settings; reply text;
begin
  perform 1 from public.staff_members where user_id=actor and active and role in ('backoffice','technical') for update;
  if not found then raise exception 'staff_required' using errcode='42501'; end if;
  if p_id is null or p_lead_id is null or p_subject is null or p_body is null or length(btrim(p_subject)) not between 1 and 200
    or p_subject ~ '[\r\n]' or length(btrim(p_body)) not between 1 and 10000 then raise exception 'invalid_message'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,19));
  select * into prior from public.lead_messages where id=p_id;
  if found then
    if prior.direction<>'outbound' or prior.created_by<>actor or prior.lead_id<>p_lead_id or prior.subject<>btrim(p_subject) or prior.body<>btrim(p_body)
      then raise exception 'message_conflict'; end if;
    return prior.id;
  end if;
  select * into cfg from lys_private.mail_settings where singleton for share;
  if not cfg.enabled then raise exception 'mail_not_ready'; end if;
  select * into customer from public.leads where id=p_lead_id for update;
  if not found then raise exception 'lead_not_found'; end if;
  if (select count(*) from public.lead_messages where created_by=actor and created_at>now()-interval '1 hour')>=30
    or (select count(*) from public.lead_messages where lead_id=p_lead_id and direction='outbound' and created_at>now()-interval '1 hour')>=10
    then raise exception 'mail_rate_limit'; end if;
  insert into lys_private.mail_threads(lead_id) values(p_lead_id) on conflict do nothing;
  select 'sag+'||token||'@'||cfg.reply_domain into reply from lys_private.mail_threads where lead_id=p_lead_id;
  insert into public.lead_messages(id,lead_id,direction,sender,recipient,subject,body,state,created_by)
    values(p_id,p_lead_id,'outbound',cfg.sender,customer.email,btrim(p_subject),btrim(p_body),'queued',actor);
  insert into lys_private.mail_jobs(message_id,payload) values(p_id,jsonb_build_object(
    'from',cfg.sender,'to',jsonb_build_array(customer.email),'reply_to',reply,'subject',btrim(p_subject),'text',btrim(p_body)));
  return p_id;
end $$;


-- Preserve the existing workflow; require a work role at its server boundary.
create or replace function public.register_push_subscription(p_subscription jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); ep text := p_subscription->>'endpoint'; saved lys_private.push_subscriptions; result uuid;
begin
  if actor is null then raise exception 'staff_required' using errcode='42501'; end if;
  perform 1 from public.staff_members where user_id=actor and active and role in ('backoffice','technical') for update;
  if not found then raise exception 'staff_required' using errcode='42501'; end if;
  -- Only known Web Push providers. No credentials, custom ports, fragments or redirects.
  if ep is null or length(ep)>2048 or ep !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/[^[:space:]#]+$'
    or coalesce(p_subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}$'
    or coalesce(p_subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'invalid_subscription' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(ep,10));
  select * into saved from lys_private.push_subscriptions where endpoint=ep for update;
  if found then
    if saved.user_id<>actor then raise exception 'subscription_owned' using errcode='42501'; end if;
    if not saved.active and (select count(*) from lys_private.push_subscriptions where user_id=actor and active)>=10 then
      raise exception 'device_limit' using errcode='22023';
    end if;
    update lys_private.push_subscriptions set active=true,
      p256dh=p_subscription->'keys'->>'p256dh',auth=p_subscription->'keys'->>'auth',
      subscribed_at=case when active then subscribed_at else now() end,updated_at=now()
      where id=saved.id returning id into result;
  else
    if (select count(*) from lys_private.push_subscriptions where user_id=actor and active)>=10 then
      raise exception 'device_limit' using errcode='22023';
    end if;
    insert into lys_private.push_subscriptions(user_id,endpoint,p256dh,auth)
      values(actor,ep,p_subscription->'keys'->>'p256dh',p_subscription->'keys'->>'auth') returning id into result;
  end if;
  return result;
end $$;


-- Preserve the existing workflow; require a work role at its server boundary.
create or replace function public.push_subscription_active(p_endpoint text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from lys_private.push_subscriptions s join public.staff_members m on m.user_id=s.user_id
    where s.endpoint=p_endpoint and s.user_id=auth.uid() and s.active and m.active and m.role in ('backoffice','technical'))
$$;


-- Preserve the existing workflow; require a work role at its server boundary.
create or replace function public.claim_push_deliveries() returns jsonb
language plpgsql security definer set search_path='' as $$
declare item lys_private.notification_outbox; count_added integer; result jsonb;
begin
  for item in select * from lys_private.notification_outbox
    where kind in ('lead_received.staff','message_received.staff') and state='pending' order by created_at,id for update skip locked limit 20
  loop
    insert into lys_private.push_deliveries(outbox_id,subscription_id)
      select item.id,s.id from lys_private.push_subscriptions s join public.staff_members m on m.user_id=s.user_id
      where s.active and m.active and m.role in ('backoffice','technical') and s.subscribed_at<=item.created_at on conflict do nothing;
    get diagnostics count_added = row_count;
    update lys_private.notification_outbox set state=case when count_added>0 then 'processing' else 'skipped' end where id=item.id;
  end loop;
  update lys_private.push_deliveries d set state='failed',last_result='inactive_or_exhausted',lease_id=null
    where d.state in ('pending','processing') and
      ((d.attempts>=5 and (d.lease_until is null or d.lease_until<=now())) or not exists
        (select 1 from lys_private.push_subscriptions s join public.staff_members m on m.user_id=s.user_id
          join lys_private.notification_outbox o on o.id=d.outbox_id
          where s.id=d.subscription_id and s.active and m.active and m.role in ('backoffice','technical') and s.subscribed_at<=o.created_at));
  update lys_private.notification_outbox o set state=case when exists
      (select 1 from lys_private.push_deliveries d where d.outbox_id=o.id and d.state='failed') then 'failed' else 'sent' end
    where o.kind in ('lead_received.staff','message_received.staff') and o.state='processing' and not exists
      (select 1 from lys_private.push_deliveries d where d.outbox_id=o.id and d.state in ('pending','processing'));
  with candidates as (
    select id from lys_private.push_deliveries
      where attempts<5 and ((state='pending' and available_at<=now()) or (state='processing' and lease_until<=now()))
      order by available_at,id for update skip locked limit 20
  ), claimed as (
    update lys_private.push_deliveries d set state='processing',attempts=attempts+1,
      lease_id=gen_random_uuid(),leased_at=now(),lease_until=now()+interval '2 minutes'
      from candidates c where c.id=d.id returning d.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'leaseId',d.lease_id,'leadId',o.lead_id,
    'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)))),'[]'::jsonb)
    into result from claimed d join lys_private.push_subscriptions s on s.id=d.subscription_id
      join lys_private.notification_outbox o on o.id=d.outbox_id;
  return result;
end $$;
