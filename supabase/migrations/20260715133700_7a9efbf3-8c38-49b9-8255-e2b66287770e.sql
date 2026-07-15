
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz;

UPDATE public.whatsapp_instances
  SET warmup_started_at = created_at
  WHERE warmup_started_at IS NULL AND status = 'connected';

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_filename text;

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_media_type_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_media_type_check
  CHECK (media_type IS NULL OR media_type IN ('image','video','document'));
