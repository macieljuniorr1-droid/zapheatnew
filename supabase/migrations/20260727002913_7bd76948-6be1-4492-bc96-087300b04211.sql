ALTER TABLE public.warmup_groups ALTER COLUMN ai_model SET DEFAULT 'local/motor-zapheat';
UPDATE public.warmup_groups SET ai_model = 'local/motor-zapheat' WHERE ai_model IS NULL OR ai_model NOT LIKE 'local/%';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_groups' AND column_name='ai_model') THEN
    EXECUTE 'ALTER TABLE public.wa_groups ALTER COLUMN ai_model SET DEFAULT ''local/motor-zapheat''';
    EXECUTE 'UPDATE public.wa_groups SET ai_model = ''local/motor-zapheat'' WHERE ai_model IS NULL OR ai_model NOT LIKE ''local/%''';
  END IF;
END $$;