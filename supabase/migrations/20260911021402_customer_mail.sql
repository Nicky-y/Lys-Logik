-- Customer conversations are independent of optimistic lead workflow versions.
-- Delivery state is a projection; original content and delivery evidence are retained.
create table lys_private.mail_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  sender text not null default 'Lys & Logik <sager@mail.lysoglogik.dk>',
  reply_domain text not null default 'mail.lysoglogik.dk' check(reply_domain = 'mail.lysoglogik.dk')
);
insert into lys_private.mail_settings default values;
create table lys_private.mail_threads (
  lead_id uuid primary key references public.leads(id),
  token text not null unique default replace(gen_random_uuid()::text,'-','') check(token ~ '^[a-f0-9]{32}$')
);
create table public.lead_messages (
  id uuid primary key,
  lead_id uuid not null references public.leads(id),
  direction text not null check(direction in ('outbound','inbound')),
  sender text not null,
  recipient text not null,
  subject text not null check(length(subject) between 1 and 200),
  body text not null check(length(body) <= 50000),
  attachments jsonb not null default '[]' check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=30),
  sender_matches_customer boolean not null default true,
  state text not null check(state in ('queued','sending','accepted','delivered','bounced','failed','review','received')),
  created_by uuid references public.staff_members(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lead_messages_timeline on public.lead_messages(lead_id,created_at,id);
create table lys_private.mail_jobs (
  message_id uuid primary key references public.lead_messages(id),
  payload jsonb not null,
  provider_id uuid unique,
  attempts integer not null default 0 check(attempts between 0 and 8),
  first_attempt_at timestamptz,
  available_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz
);
create table lys_private.mail_receipts (
  event_id text primary key check(length(event_id) between 1 and 200),
  provider_id uuid not null,
  event_type text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index mail_receipts_provider on lys_private.mail_receipts(provider_id);
create table lys_private.mail_inbound (
  provider_id uuid primary key,
  message_id uuid unique references public.lead_messages(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table public.mail_message_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.lead_messages(id),
  state text not null,
  created_at timestamptz not null default now()
);
alter table public.lead_messages enable row level security;
alter table public.mail_message_events enable row level security;
create policy staff_read_messages on public.lead_messages for select to authenticated using(public.is_staff());
create policy staff_read_mail_events on public.mail_message_events for select to authenticated using(public.is_staff());
revoke all on public.lead_messages,public.mail_message_events from public,anon,authenticated;
grant select on public.lead_messages,public.mail_message_events to authenticated;
revoke all on lys_private.mail_settings,lys_private.mail_threads,lys_private.mail_jobs,lys_private.mail_receipts,lys_private.mail_inbound from public,anon,authenticated;
alter table lys_private.mail_settings enable row level security;
alter table lys_private.mail_threads enable row level security;
alter table lys_private.mail_jobs enable row level security;
alter table lys_private.mail_receipts enable row level security;
alter table lys_private.mail_inbound enable row level security;

create function lys_private.record_mail_state() returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    if (new.id,new.lead_id,new.direction,new.sender,new.recipient,new.subject,new.body,new.attachments,new.created_by,new.created_at,new.sender_matches_customer)
      is distinct from (old.id,old.lead_id,old.direction,old.sender,old.recipient,old.subject,old.body,old.attachments,old.created_by,old.created_at,old.sender_matches_customer)
      then raise exception 'immutable_message'; end if;
    if new.state=old.state then return new; end if;
  end if;
  insert into public.mail_message_events(message_id,state) values(new.id,new.state);
  return new;
end $$;
create trigger mail_state_evidence after insert or update on public.lead_messages for each row execute function lys_private.record_mail_state();

create function public.customer_mail_enabled() returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not public.is_staff() then raise exception 'staff_required' using errcode='42501'; end if;
  return (select enabled from lys_private.mail_settings where singleton);
end $$;

create function public.queue_customer_message(p_id uuid,p_lead_id uuid,p_subject text,p_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); prior public.lead_messages; customer public.leads; cfg lys_private.mail_settings; reply text;
begin
  perform 1 from public.staff_members where user_id=actor and active for update;
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

create function public.claim_customer_mail() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not (select enabled from lys_private.mail_settings where singleton) then return '[]'::jsonb; end if;
  -- Resend retains idempotency keys for 24h. Never retry an ambiguous send after that window.
  update public.lead_messages m set state='review',updated_at=now() from lys_private.mail_jobs j
    where j.message_id=m.id and m.state in ('queued','sending')
    and (j.first_attempt_at<now()-interval '23 hours' or (j.attempts>=8 and j.lease_until<=now()));
  with candidates as (
    select j.message_id from lys_private.mail_jobs j join public.lead_messages m on m.id=j.message_id
    where m.state in ('queued','sending') and j.attempts<8 and j.available_at<=now() and (j.lease_until is null or j.lease_until<=now())
    order by j.available_at,j.message_id for update of j skip locked limit 5
  ), claimed as (
    update lys_private.mail_jobs j set attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    from candidates c where c.message_id=j.message_id returning j.*
  ), marked as (
    update public.lead_messages m set state='sending',updated_at=now() from claimed j where m.id=j.message_id returning m.id
  ) select coalesce(jsonb_agg(jsonb_build_object('id',j.message_id,'leaseId',j.lease_id,'payload',j.payload)),'[]'::jsonb)
    into result from claimed j join marked m on m.id=j.message_id;
  return result;
end $$;

create function public.complete_customer_mail(p_id uuid,p_lease_id uuid,p_result text,p_provider_id uuid default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare job lys_private.mail_jobs; target text;
begin
  if p_result is null or p_result not in ('accepted','retry','failed','review') or (p_result='accepted' and p_provider_id is null) then raise exception 'invalid_result'; end if;
  select * into job from lys_private.mail_jobs where message_id=p_id and lease_id=p_lease_id for update;
  if not found then return false; end if;
  if p_provider_id is not null then perform pg_advisory_xact_lock(hashtextextended(p_provider_id::text,23)); end if;
  target:=case when p_result='retry' then case when job.attempts<8 then 'queued' else 'review' end else p_result end;
  if p_result='accepted' then
    select case when exists(select 1 from lys_private.mail_receipts where provider_id=p_provider_id and event_type in ('email.bounced','email.failed','email.complained')) then 'bounced'
      when exists(select 1 from lys_private.mail_receipts where provider_id=p_provider_id and event_type='email.delivered') then 'delivered' else 'accepted' end into target;
  end if;
  update lys_private.mail_jobs set provider_id=coalesce(p_provider_id,provider_id),lease_id=null,lease_until=null,
    available_at=now()+make_interval(secs=>least(3600,60*power(2,job.attempts-1)::integer)) where message_id=p_id;
  update public.lead_messages set state=target,updated_at=now() where id=p_id;
  return true;
end $$;

create function public.record_customer_mail_delivery(p_event_id text,p_provider_id uuid,p_type text,p_occurred_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_type not in ('email.delivered','email.bounced','email.failed','email.complained') then raise exception 'invalid_event'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider_id::text,23));
  insert into lys_private.mail_receipts(event_id,provider_id,event_type,occurred_at) values(p_event_id,p_provider_id,p_type,p_occurred_at) on conflict do nothing;
  update public.lead_messages m set state=case when p_type='email.delivered' then 'delivered' else 'bounced' end,updated_at=now()
    from lys_private.mail_jobs j where j.message_id=m.id and j.provider_id=p_provider_id and m.state not in ('bounced','failed');
end $$;

-- New reply notifications share the existing durable per-device delivery mechanism.
alter table lys_private.notification_outbox drop constraint notification_outbox_kind_check;
alter table lys_private.notification_outbox add constraint notification_outbox_kind_check check(kind in ('lead_received.staff','lead_received.customer','message_received.staff'));
alter table lys_private.notification_outbox drop constraint notification_outbox_lead_id_kind_key;
create unique index lead_notification_once on lys_private.notification_outbox(lead_id,kind) where kind in ('lead_received.staff','lead_received.customer');
alter table lys_private.notification_outbox add column message_id uuid unique references public.lead_messages(id);

create function public.receive_customer_mail(p_event_id text,p_provider_id uuid,p_occurred_at timestamptz,p_mail jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid; msg uuid; customer_email text; destinations text[]; matches integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_provider_id::text,29));
  if exists(select 1 from lys_private.mail_inbound where provider_id=p_provider_id) then
    return (select message_id from lys_private.mail_inbound where provider_id=p_provider_id);
  end if;
  if jsonb_typeof(p_mail->'to') is distinct from 'array' or length(p_mail->>'body')>50000 then raise exception 'invalid_message'; end if;
  select array_agg(lower(value)) into destinations from jsonb_array_elements_text(p_mail->'to');
  select count(*), (array_agg(t.lead_id))[1] into matches,target from lys_private.mail_threads t cross join lys_private.mail_settings s
    where ('sag+'||t.token||'@'||s.reply_domain)=any(destinations);
  -- Ambiguous and unknown routing is retained privately for recovery, never attached by guessing an email address.
  if matches=1 then
    select email into customer_email from public.leads where id=target;
    msg:=gen_random_uuid();
    insert into public.lead_messages(id,lead_id,direction,sender,recipient,subject,body,attachments,sender_matches_customer,state)
      values(msg,target,'inbound',p_mail->>'from',array_to_string(destinations,', '),left(coalesce(nullif(p_mail->>'subject',''),'(uden emne)'),200),
        p_mail->>'body',coalesce(p_mail->'attachments','[]'::jsonb),lower(customer_email)=lower(p_mail->>'senderEmail'),'received');
    insert into lys_private.notification_outbox(lead_id,kind,message_id) values(target,'message_received.staff',msg);
  end if;
  insert into lys_private.mail_inbound(provider_id,message_id,payload) values(p_provider_id,msg,p_mail);
  insert into lys_private.mail_receipts(event_id,provider_id,event_type,occurred_at) values(p_event_id,p_provider_id,'email.received',p_occurred_at) on conflict do nothing;
  return msg;
end $$;

create function public.customer_attachment_source(p_message_id uuid,p_attachment_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare provider uuid;
begin
  if not public.is_staff() then raise exception 'staff_required' using errcode='42501'; end if;
  select i.provider_id into provider from lys_private.mail_inbound i join public.lead_messages m on m.id=i.message_id
    where m.id=p_message_id and exists(select 1 from jsonb_array_elements(m.attachments) a where a->>'id'=p_attachment_id::text);
  if provider is null then raise exception 'attachment_not_found'; end if;
  return provider;
end $$;

revoke all on function public.customer_mail_enabled(),public.queue_customer_message(uuid,uuid,text,text),public.claim_customer_mail(),public.complete_customer_mail(uuid,uuid,text,uuid),public.record_customer_mail_delivery(text,uuid,text,timestamptz),public.receive_customer_mail(text,uuid,timestamptz,jsonb),public.customer_attachment_source(uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_mail_enabled(),public.queue_customer_message(uuid,uuid,text,text),public.customer_attachment_source(uuid,uuid) to authenticated;
grant execute on function public.claim_customer_mail(),public.complete_customer_mail(uuid,uuid,text,uuid),public.record_customer_mail_delivery(text,uuid,text,timestamptz),public.receive_customer_mail(text,uuid,timestamptz,jsonb) to service_role;
comment on table public.lead_messages is 'Immutable customer correspondence. Accepted/delivered refers to provider/recipient-server acceptance, not proof of reading. Sender match compares addresses only; it is not identity verification.';
comment on function public.queue_customer_message(uuid,uuid,text,text) is 'Active staff only. Caller supplies a durable message UUID for retries; customer address and reply routing are derived on the server. No historical notification intents are sent.';
create or replace function public.claim_push_deliveries() returns jsonb
language plpgsql security definer set search_path='' as $$
declare item lys_private.notification_outbox; count_added integer; result jsonb;
begin
  for item in select * from lys_private.notification_outbox
    where kind in ('lead_received.staff','message_received.staff') and state='pending' order by created_at,id for update skip locked limit 20
  loop
    insert into lys_private.push_deliveries(outbox_id,subscription_id)
      select item.id,s.id from lys_private.push_subscriptions s join public.staff_members m on m.user_id=s.user_id
      where s.active and m.active and s.subscribed_at<=item.created_at on conflict do nothing;
    get diagnostics count_added = row_count;
    update lys_private.notification_outbox set state=case when count_added>0 then 'processing' else 'skipped' end where id=item.id;
  end loop;
  update lys_private.push_deliveries d set state='failed',last_result='inactive_or_exhausted',lease_id=null
    where d.state in ('pending','processing') and
      ((d.attempts>=5 and (d.lease_until is null or d.lease_until<=now())) or not exists
        (select 1 from lys_private.push_subscriptions s join public.staff_members m on m.user_id=s.user_id
          join lys_private.notification_outbox o on o.id=d.outbox_id
          where s.id=d.subscription_id and s.active and m.active and s.subscribed_at<=o.created_at));
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
