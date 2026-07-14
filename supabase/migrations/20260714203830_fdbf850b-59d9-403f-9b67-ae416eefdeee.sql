ALTER TABLE public.warmup_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.warmup_logs;