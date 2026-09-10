-- Web Push subscriptions are private capabilities, owned by one active employee.
create table lys_private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.staff_members(user_id),
  endpoint text not null unique check (length(endpoint) between 30 and 2048),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}$'),
  active boolean not null default true,
  subscribed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table lys_private.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references lys_private.notification_outbox(id),
  subscription_id uuid not null references lys_private.push_subscriptions(id),
  state text not null default 'pending' check (state in ('pending','processing','sent','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  available_at timestamptz not null default now(),
  lease_id uuid,
  leased_at timestamptz,
  lease_until timestamptz,
  delivered_at timestamptz,
  last_result text,
  unique (outbox_id,subscription_id)
);
alter table lys_private.push_subscriptions enable row level security;
alter table lys_private.push_deliveries enable row level security;
revoke all on lys_private.push_subscriptions,lys_private.push_deliveries from public,anon,authenticated;
alter table lys_private.notification_outbox drop constraint notification_outbox_state_check;
alter table lys_private.notification_outbox add constraint notification_outbox_state_check
  check (state in ('pending','processing','sent','failed','skipped'));

create function public.register_push_subscription(p_subscription jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); ep text := p_subscription->>'endpoint'; saved lys_private.push_subscriptions; result uuid;
begin
  if actor is null then raise exception 'staff_required' using errcode='42501'; end if;
  perform 1 from public.staff_members where user_id=actor and active for update;
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

create function public.push_subscription_active(p_endpoint text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from lys_private.push_subscriptions s join public.staff_members m on m.user_id=s.user_id
    where s.endpoint=p_endpoint and s.user_id=auth.uid() and s.active and m.active)
$$;
create function public.disable_push_subscription(p_endpoint text) returns void
language sql security definer set search_path='' as $$
  update lys_private.push_subscriptions set active=false,updated_at=now() where endpoint=p_endpoint and user_id=auth.uid()
$$;

-- Server only. Fan out each staff intent once; never backfill pre-subscription leads.
create function public.claim_push_deliveries() returns jsonb
language plpgsql security definer set search_path='' as $$
declare item lys_private.notification_outbox; count_added integer; result jsonb;
begin
  for item in select * from lys_private.notification_outbox
    where kind='lead_received.staff' and state='pending' order by created_at,id for update skip locked limit 20
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
    where o.kind='lead_received.staff' and o.state='processing' and not exists
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

create function public.complete_push_delivery(p_id uuid,p_lease_id uuid,p_result text,p_retry_after integer default 60) returns boolean
language plpgsql security definer set search_path='' as $$
declare d lys_private.push_deliveries;
begin
  if p_result is null or p_result not in ('accepted','gone','retry','rejected') then raise exception 'invalid_result'; end if;
  select * into d from lys_private.push_deliveries where id=p_id and lease_id=p_lease_id and state='processing' for update;
  if not found then return false; end if;
  update lys_private.push_deliveries set
    state=case when p_result='accepted' then 'sent' when p_result='retry' and attempts<5 then 'pending' else 'failed' end,
    available_at=now()+make_interval(secs=>greatest(60*power(2,attempts-1)::integer,least(3600,greatest(60,coalesce(p_retry_after,60))))),
    delivered_at=case when p_result='accepted' then now() else null end,last_result=p_result,lease_id=null,lease_until=null
    where id=d.id;
  if p_result='gone' then
    update lys_private.push_subscriptions set active=false,updated_at=now() where id=d.subscription_id and updated_at<=d.leased_at;
  end if;
  return true;
end $$;

revoke all on function public.register_push_subscription(jsonb),public.push_subscription_active(text),public.disable_push_subscription(text),
  public.claim_push_deliveries(),public.complete_push_delivery(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.register_push_subscription(jsonb),public.push_subscription_active(text),public.disable_push_subscription(text) to authenticated;
grant execute on function public.claim_push_deliveries(),public.complete_push_delivery(uuid,uuid,text,integer) to service_role;
comment on function public.claim_push_deliveries() is 'Server-only leased delivery batch. Staff intents become per-device tasks; no historical backfill. Customer mail intents remain untouched.';
comment on function public.complete_push_delivery(uuid,uuid,text,integer) is 'Fenced completion for one delivery attempt. Accepted means push-provider acceptance, not proof the employee saw the notification.';
