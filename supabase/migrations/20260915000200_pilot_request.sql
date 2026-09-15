-- Release before create-lead, operations and website. Old seven-field clients
-- remain valid; their original snapshots and retry receipts are not rewritten.
alter table public.leads
  add constraint lead_pilot_request_boolean check (
    not (original_submission ? 'pilotRequested')
    or jsonb_typeof(original_submission->'pilotRequested') = 'boolean'
  ),
  add column pilot_requested boolean generated always as (
    (original_submission->>'pilotRequested')::boolean
  ) stored;

comment on column public.leads.pilot_requested is
  'Customer interest from the original enquiry, never pilot acceptance. NULL means the older form did not ask.';

create or replace function public.create_lead_submission(p_key uuid, p_submission jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  receipt jsonb;
  saved public.leads;
  normalized_phone text;
begin
  if p_key is null or jsonb_typeof(p_submission) is distinct from 'object' then
    raise exception 'invalid_submission' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));
  receipt := public.find_lead_submission(p_key, p_submission);
  if receipt is not null then return receipt; end if;

  if not (p_submission ?& array['name','email','phone','postalCode','service','description','terms'])
    or p_submission - array['name','email','phone','postalCode','service','description','terms','pilotRequested'] <> '{}'::jsonb
  then
    raise exception 'invalid_submission' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_submission) f
      where f.key not in ('terms','pilotRequested') and jsonb_typeof(f.value) <> 'string')
    or p_submission->'terms' is distinct from 'true'::jsonb
    or (p_submission ? 'pilotRequested' and jsonb_typeof(p_submission->'pilotRequested') <> 'boolean')
  then
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

revoke all on function public.create_lead_submission(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.create_lead_submission(uuid,jsonb) to service_role;
comment on function public.create_lead_submission(uuid,jsonb) is
  'Server-only intake after bot validation: atomically persists snapshot, event and outbox; matching retries return the original receipt. Optional pilotRequested records interest without approving work.';
