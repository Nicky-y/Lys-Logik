-- Expand accepted service choices without rewriting historical enquiries or snapshots.
-- Release order: apply this migration, deploy create-lead and the updated operations app,
-- then publish the website so the entire intake path accepts the new choices.
begin;
alter table public.leads drop constraint leads_service_check;
alter table public.leads add constraint leads_service_check check (
  service in (
    'lampeopsaetning', 'stikkontakter', 'smart-home', 'lysstyring-sensorer',
    'hvidevarer', 'belysning', 'forbedringer', 'andet'
  )
);
commit;
