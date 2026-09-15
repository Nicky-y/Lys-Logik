-- Add a category without reclassifying existing leads or rewriting their snapshots.
-- Release order: database, create-lead, operations app, public website.
begin;

alter table public.leads drop constraint leads_service_check;
alter table public.leads add constraint leads_service_check check (
  service in (
    'bygningsautomatik', 'lampeopsaetning', 'stikkontakter', 'smart-home',
    'lysstyring-sensorer', 'hvidevarer', 'belysning', 'forbedringer', 'andet'
  )
);

commit;
