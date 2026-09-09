-- First slice: immutable enquiry snapshots, staff-only reads and atomic intake.
create schema lys_private;
revoke all on schema lys_private from public, anon, authenticated;

create type public.lead_status as enum (
  'new', 'clarifying', 'qualified', 'scheduled', 'completed',
  'invoiced', 'paid', 'rejected', 'outside_scope', 'cancelled'
);

create table public.staff_members (
  user_id uuid primary key references auth.users(id),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  reference uuid not null unique default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  email text not null check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text not null check (phone = '' or phone ~ '^\+45[0-9]{8}$'),
  postal_code text not null check (postal_code ~ '^[0-9]{4}$'),
  service text not null check (service in ('belysning', 'smart-home', 'forbedringer', 'andet')),
  description text not null check (char_length(btrim(description)) between 10 and 1500),
  original_submission jsonb not null check (jsonb_typeof(original_submission) = 'object'),
  status public.lead_status not null default 'new',
  version integer not null default 1 check (version > 0),
  source text not null default 'website' check (source = 'website'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_status_created_idx on public.leads (status, created_at desc);

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id),
  event_type text not null check (event_type = 'lead_created'),
  actor_type text not null check (actor_type = 'system'),
  created_at timestamptz not null default now(),
  unique (lead_id, event_type)
);

create table lys_private.lead_submissions (
  submission_key uuid primary key,
  lead_id uuid not null unique references public.leads(id),
  created_at timestamptz not null default now()
);

create table lys_private.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id),
  kind text not null check (kind in ('lead_received.staff', 'lead_received.customer')),
  state text not null default 'pending' check (state in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (lead_id, kind)
);

-- Global guard persists across Edge Function instances. No client-supplied IP is trusted.
create table lys_private.lead_request_limit (
  singleton boolean primary key default true check (singleton),
  minute_start timestamptz not null default now(),
  minute_count integer not null default 0,
  hour_start timestamptz not null default now(),
  hour_count integer not null default 0,
  max_per_minute integer not null default 20 check (max_per_minute > 0),
  max_per_hour integer not null default 200 check (max_per_hour > 0)
);
insert into lys_private.lead_request_limit (singleton) values (true);

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members where user_id = auth.uid() and active);
$$;
revoke all on function public.is_staff() from public, anon, authenticated;
grant execute on function public.is_staff() to authenticated;

alter table public.staff_members enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table lys_private.lead_submissions enable row level security;
alter table lys_private.notification_outbox enable row level security;
alter table lys_private.lead_request_limit enable row level security;

revoke all on public.staff_members, public.leads, public.lead_events from public, anon, authenticated;
grant select on public.staff_members, public.leads, public.lead_events to authenticated;
create policy staff_read_members on public.staff_members for select to authenticated using ((select public.is_staff()));
create policy staff_read_leads on public.leads for select to authenticated using ((select public.is_staff()));
create policy staff_read_events on public.lead_events for select to authenticated using ((select public.is_staff()));

create function public.find_lead_submission(p_key uuid, p_submission jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved public.leads;
begin
  select l.* into saved from public.leads l
    join lys_private.lead_submissions s on s.lead_id = l.id where s.submission_key = p_key;
  if not found then return null; end if;
  if saved.original_submission is distinct from p_submission then
    raise exception 'submission_conflict' using errcode = 'P0001';
  end if;
  return jsonb_build_object('reference', saved.reference);
end;
$$;

create function public.create_lead_submission(p_key uuid, p_submission jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  receipt jsonb;
  saved public.leads;
  normalized_phone text;
begin
  if p_key is null or jsonb_typeof(p_submission) is distinct from 'object' then
    raise exception 'invalid_submission' using errcode = '22023';
  end if;
  -- Serializes the same key; unrelated enquiries proceed independently.
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));
  receipt := public.find_lead_submission(p_key, p_submission);
  if receipt is not null then return receipt; end if;

  if (select count(*) from jsonb_object_keys(p_submission)) <> 7
    or not (p_submission ?& array['name','email','phone','postalCode','service','description','terms'])
  then
    raise exception 'invalid_submission' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_submission) f where f.key <> 'terms' and jsonb_typeof(f.value) <> 'string')
    or p_submission->'terms' is distinct from 'true'::jsonb then
    raise exception 'invalid_submission' using errcode = '22023';
  end if;
  normalized_phone := regexp_replace(p_submission->>'phone', '[[:space:]-]', '', 'g');
  if normalized_phone ~ '^[0-9]{8}$' then normalized_phone := '+45' || normalized_phone; end if;

  insert into public.leads (name,email,phone,postal_code,service,description,original_submission)
  values (p_submission->>'name',p_submission->>'email',normalized_phone,p_submission->>'postalCode',
    p_submission->>'service',p_submission->>'description',p_submission)
  returning * into saved;
  insert into lys_private.lead_submissions (submission_key,lead_id) values (p_key,saved.id);
  insert into public.lead_events (lead_id,event_type,actor_type) values (saved.id,'lead_created','system');
  insert into lys_private.notification_outbox (lead_id,kind) values
    (saved.id,'lead_received.staff'), (saved.id,'lead_received.customer');
  return jsonb_build_object('reference',saved.reference);
end;
$$;

create function public.consume_lead_request() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  limits lys_private.lead_request_limit;
  checked_at timestamptz := clock_timestamp();
  retry_after integer;
begin
  select * into strict limits from lys_private.lead_request_limit where singleton for update;
  if checked_at >= limits.minute_start + interval '1 minute' then
    limits.minute_start := checked_at; limits.minute_count := 0;
  end if;
  if checked_at >= limits.hour_start + interval '1 hour' then
    limits.hour_start := checked_at; limits.hour_count := 0;
  end if;
  if limits.hour_count >= limits.max_per_hour then
    retry_after := greatest(1,ceil(extract(epoch from limits.hour_start + interval '1 hour' - checked_at))::integer);
  elsif limits.minute_count >= limits.max_per_minute then
    retry_after := greatest(1,ceil(extract(epoch from limits.minute_start + interval '1 minute' - checked_at))::integer);
  else
    update lys_private.lead_request_limit set
      minute_start = limits.minute_start, minute_count = limits.minute_count + 1,
      hour_start = limits.hour_start, hour_count = limits.hour_count + 1 where singleton;
    return jsonb_build_object('allowed',true,'retryAfter',0);
  end if;
  return jsonb_build_object('allowed',false,'retryAfter',retry_after);
end;
$$;

revoke all on function public.find_lead_submission(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.create_lead_submission(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.consume_lead_request() from public, anon, authenticated;
grant execute on function public.find_lead_submission(uuid,jsonb) to service_role;
grant execute on function public.create_lead_submission(uuid,jsonb) to service_role;
grant execute on function public.consume_lead_request() to service_role;

comment on function public.create_lead_submission(uuid,jsonb) is
  'Server-only intake after bot validation: atomically persists snapshot, event and outbox; matching retries return the original receipt.';
comment on table lys_private.notification_outbox is
  'Pending delivery intents. A later delivery worker sends email/push; a pending row does not mean sent.';
