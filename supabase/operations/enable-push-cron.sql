-- Run only after dispatch-push is deployed and lys_logik_push_cron exists in Vault.
-- Secret values are never embedded in cron.job or this file.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('lys-logik-web-push','* * * * *',$job$
  select net.http_post(
    url:='https://elydnshkxcwlmbdmtpys.supabase.co/functions/v1/dispatch-push',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='lys_logik_push_cron')),
    body:='{}'::jsonb,timeout_milliseconds:=55000
  );
$job$);
