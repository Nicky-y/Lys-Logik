-- Run only after domain sending/receiving, signed webhook and Edge secrets are verified.
-- Reuses the dispatcher credential; no secret value is embedded here.
select cron.schedule('lys-logik-customer-mail','* * * * *',$job$
  select net.http_post(
    url:='https://elydnshkxcwlmbdmtpys.supabase.co/functions/v1/dispatch-mail',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='lys_logik_push_cron')),
    body:='{}'::jsonb,timeout_milliseconds:=55000
  );
$job$);
update lys_private.mail_settings set enabled=true where singleton;
