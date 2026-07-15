CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.warmup_groups REPLICA IDENTITY FULL;
ALTER TABLE public.warmup_group_members REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_instances REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.warmup_groups;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.warmup_group_members;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_instances;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

SELECT cron.unschedule('warmup-tick-30s')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'warmup-tick-30s');

SELECT cron.schedule(
  'warmup-tick-30s',
  '* * * * *',
  $$
  SELECT pg_sleep(30);
  SELECT net.http_post(
    url := 'https://project--c31ba9e6-9f12-47db-b03f-aa4fc60f320c-dev.lovable.app/api/public/hooks/warmup-tick',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_li6lRNvpgx4fW5a2e3X8kQ_24d9Chpg"}'::jsonb,
    body := '{"slot":"30s"}'::jsonb
  );
  $$
);