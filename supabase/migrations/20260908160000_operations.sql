-- P1: staff commands, append-only history and optimistic concurrency.
alter table public.staff_members add column role text not null default 'backoffice' check (role in ('backoffice','technical'));
alter table public.leads
  add column waiting_on text check (waiting_on in ('staff','customer')),
  add column review_decision text not null default 'pending' check (review_decision in ('pending','approved','declined')),
  add column review_summary text,
  add column reviewed_by uuid references public.staff_members(user_id),
  add column reviewed_at timestamptz,
  add constraint lead_waiting_state check (waiting_on is null or status = 'clarifying'),
  add constraint lead_review_evidence check (
    (review_decision='pending' and review_summary is null and reviewed_by is null and reviewed_at is null) or
    (review_decision<>'pending' and char_length(btrim(review_summary)) between 10 and 2000 and reviewed_by is not null and reviewed_at is not null)
  ),
  add constraint qualified_requires_review check (status <> 'qualified' or review_decision='approved');

alter table public.lead_events
  drop constraint lead_events_event_type_check,
  drop constraint lead_events_actor_type_check,
  drop constraint lead_events_lead_id_event_type_key,
  add column actor_id uuid references public.staff_members(user_id),
  add column actor_name text,
  add column lead_version integer not null default 1 check (lead_version > 0),
  add column from_status public.lead_status,
  add column to_status public.lead_status,
  add column body text,
  add column details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  add constraint lead_events_type check (event_type in ('lead_created','status_changed','review_recorded','waiting_changed','note_added')),
  add constraint lead_events_actor check (
    (event_type='lead_created' and actor_type='system' and actor_id is null and actor_name is null) or
    (event_type<>'lead_created' and actor_type='staff' and actor_id is not null and char_length(actor_name)>0)
  ),
  add constraint lead_event_version_unique unique (lead_id,lead_version);
create unique index lead_created_once on public.lead_events(lead_id) where event_type='lead_created';
create index lead_history_order on public.lead_events(lead_id,lead_version desc);

create table lys_private.staff_commands (
  command_id uuid primary key,
  actor_id uuid not null references public.staff_members(user_id),
  lead_id uuid not null references public.leads(id),
  kind text not null,
  payload jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default now()
);
alter table lys_private.staff_commands enable row level security;
revoke all on lys_private.staff_commands from public,anon,authenticated;

create function lys_private.execute_staff_command(
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
revoke all on function lys_private.execute_staff_command(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;

create function public.change_lead_status(p_lead_id uuid,p_expected_version integer,p_command_id uuid,p_status public.lead_status,p_reason text default null)
returns jsonb language sql security definer set search_path='' as $$
  select lys_private.execute_staff_command(p_command_id,p_lead_id,p_expected_version,'status',jsonb_build_object('status',p_status,'reason',p_reason));
$$;
create function public.set_lead_waiting(p_lead_id uuid,p_expected_version integer,p_command_id uuid,p_waiting_on text)
returns jsonb language sql security definer set search_path='' as $$
  select lys_private.execute_staff_command(p_command_id,p_lead_id,p_expected_version,'waiting',jsonb_build_object('waitingOn',p_waiting_on));
$$;
create function public.record_lead_review(p_lead_id uuid,p_expected_version integer,p_command_id uuid,p_decision text,p_summary text)
returns jsonb language sql security definer set search_path='' as $$
  select lys_private.execute_staff_command(p_command_id,p_lead_id,p_expected_version,'review',jsonb_build_object('decision',p_decision,'summary',p_summary));
$$;
create function public.add_lead_note(p_lead_id uuid,p_expected_version integer,p_command_id uuid,p_body text)
returns jsonb language sql security definer set search_path='' as $$
  select lys_private.execute_staff_command(p_command_id,p_lead_id,p_expected_version,'note',jsonb_build_object('body',p_body));
$$;
revoke all on function public.change_lead_status(uuid,integer,uuid,public.lead_status,text) from public,anon,authenticated;
revoke all on function public.set_lead_waiting(uuid,integer,uuid,text) from public,anon,authenticated;
revoke all on function public.record_lead_review(uuid,integer,uuid,text,text) from public,anon,authenticated;
revoke all on function public.add_lead_note(uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.change_lead_status(uuid,integer,uuid,public.lead_status,text) to authenticated;
grant execute on function public.set_lead_waiting(uuid,integer,uuid,text) to authenticated;
grant execute on function public.record_lead_review(uuid,integer,uuid,text,text) to authenticated;
grant execute on function public.add_lead_note(uuid,integer,uuid,text) to authenticated;
comment on function public.change_lead_status(uuid,integer,uuid,public.lead_status,text) is
  'Staff-only ChangeLeadStatus. Actor comes from login; expected version prevents lost updates; a command ID makes exact retries idempotent. State and history commit together.';
comment on function public.record_lead_review(uuid,integer,uuid,text,text) is
  'Records a technical employee assessment as evidence; does not itself qualify or schedule the lead. Backoffice cannot issue technical approval.';
comment on function public.add_lead_note(uuid,integer,uuid,text) is
  'Append-only internal note in lead history. No customer email is sent; notes cannot be edited or deleted through the app.';
