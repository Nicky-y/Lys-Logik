-- Internal calendar: a booking and its lead status/history commit together.
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  location text not null default '' check (char_length(location)<=300),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_zone text not null default 'Europe/Copenhagen' check (time_zone='Europe/Copenhagen'),
  state text not null default 'booked' check (state in ('booked','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_range check (isfinite(starts_at) and isfinite(ends_at) and starts_at>='2020-01-01T00:00:00Z'::timestamptz and ends_at<'2101-01-01T00:00:00Z'::timestamptz and ends_at-starts_at between interval '1 minute' and interval '24 hours')
);
create unique index one_booked_appointment_per_lead on public.appointments(lead_id) where state='booked';
create index calendar_appointments on public.appointments(starts_at,id) where state='booked';
alter table public.appointments enable row level security;
revoke all on public.appointments from public,anon,authenticated;
grant select on public.appointments to authenticated;
create policy staff_read_appointments on public.appointments for select to authenticated using ((select public.is_staff()));
alter table public.lead_events drop constraint lead_events_type,
  add constraint lead_events_type check (event_type in ('lead_created','status_changed','review_recorded','waiting_changed','note_added','appointment_created','appointment_rescheduled','appointment_cancelled'));
alter table public.leads drop constraint qualified_requires_review,
  add constraint qualified_requires_review check (status not in ('qualified','scheduled') or review_decision='approved');

-- Cross-table consistency is checked at commit, after both sides of the command have changed.
create function lys_private.check_lead_appointment() returns trigger
language plpgsql security definer set search_path='' as $$
declare scope_id uuid; scope_ids uuid[];
begin
  if tg_table_name='leads' then
    scope_ids := array[new.id];
  elsif tg_op='DELETE' then scope_ids := array[old.lead_id];
  elsif tg_op='INSERT' then scope_ids := array[new.lead_id];
  else scope_ids := array[old.lead_id,new.lead_id]; end if;
  foreach scope_id in array scope_ids loop
    if exists (select 1 from public.leads l where l.id=scope_id and
      ((l.status='scheduled') is distinct from exists(select 1 from public.appointments a where a.lead_id=l.id and a.state='booked')))
    then raise exception 'appointment_status_mismatch' using errcode='23514'; end if;
  end loop;
  return null;
end;
$$;
revoke all on function lys_private.check_lead_appointment() from public,anon,authenticated;
create constraint trigger lead_appointment_consistency after insert or update on public.leads
  deferrable initially deferred for each row execute function lys_private.check_lead_appointment();
create constraint trigger appointment_lead_consistency after insert or update or delete on public.appointments
  deferrable initially deferred for each row execute function lys_private.check_lead_appointment();

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
  select display_name,role into actor_label,actor_role from public.staff_members where user_id=actor and active for share;
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
    if actor_role<>'technical' then raise exception 'reviewer_required' using errcode='42501'; end if;
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

create function public.create_lead_appointment(p_lead_id uuid,p_expected_version integer,p_command_id uuid,p_title text,p_location text,p_starts_at text,p_ends_at text)
returns jsonb language sql security definer set search_path='' as $$
  select lys_private.execute_staff_command(p_command_id,p_lead_id,p_expected_version,'appointment_create',jsonb_build_object('title',p_title,'location',p_location,'startsAt',p_starts_at,'endsAt',p_ends_at));
$$;
create function public.reschedule_lead_appointment(p_lead_id uuid,p_expected_version integer,p_command_id uuid,p_appointment_id uuid,p_title text,p_location text,p_starts_at text,p_ends_at text,p_reason text)
returns jsonb language sql security definer set search_path='' as $$
  select lys_private.execute_staff_command(p_command_id,p_lead_id,p_expected_version,'appointment_reschedule',jsonb_build_object('appointmentId',p_appointment_id,'title',p_title,'location',p_location,'startsAt',p_starts_at,'endsAt',p_ends_at,'reason',p_reason));
$$;
create function public.cancel_lead_appointment(p_lead_id uuid,p_expected_version integer,p_command_id uuid,p_appointment_id uuid,p_reason text)
returns jsonb language sql security definer set search_path='' as $$
  select lys_private.execute_staff_command(p_command_id,p_lead_id,p_expected_version,'appointment_cancel',jsonb_build_object('appointmentId',p_appointment_id,'reason',p_reason));
$$;
revoke all on function public.create_lead_appointment(uuid,integer,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.reschedule_lead_appointment(uuid,integer,uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.cancel_lead_appointment(uuid,integer,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_lead_appointment(uuid,integer,uuid,text,text,text,text) to authenticated;
grant execute on function public.reschedule_lead_appointment(uuid,integer,uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.cancel_lead_appointment(uuid,integer,uuid,uuid,text) to authenticated;
comment on table public.appointments is 'Internal shared calendar. At most one booked appointment per lead; cancelled rows and before/after history are retained. No external calendar or customer message is sent.';
comment on function public.create_lead_appointment(uuid,integer,uuid,text,text,text,text) is 'Books a qualified, technically approved lead and changes its status atomically. Explicit timestamp offsets required; expected lead version and command identity protect concurrent edits and retries.';
comment on function public.reschedule_lead_appointment(uuid,integer,uuid,uuid,text,text,text,text,text) is 'Updates the same booked appointment. Requires a reason, active staff login and current lead version; retains previous details in immutable history.';
comment on function public.cancel_lead_appointment(uuid,integer,uuid,uuid,text) is 'Cancels the booking and returns its lead to clarification, awaiting staff. Preserves the appointment and reason in history; does not cancel the lead or notify the customer.';
