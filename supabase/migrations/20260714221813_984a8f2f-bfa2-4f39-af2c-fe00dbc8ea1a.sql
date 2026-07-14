
CREATE TABLE public.contact_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_lists TO authenticated;
GRANT ALL ON public.contact_lists TO service_role;
ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY cl_owner_all ON public.contact_lists FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'admin'));

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_list ON public.contacts(list_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY c_owner_all ON public.contacts FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'admin'));

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  message text NOT NULL,
  list_id uuid REFERENCES public.contact_lists(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  min_delay_seconds integer NOT NULL DEFAULT 30,
  max_delay_seconds integer NOT NULL DEFAULT 90,
  per_instance_daily_limit integer NOT NULL DEFAULT 100,
  active_hour_start integer NOT NULL DEFAULT 8,
  active_hour_end integer NOT NULL DEFAULT 20,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY camp_owner ON public.campaigns FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'admin'));

CREATE TABLE public.campaign_instances (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, instance_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_instances TO authenticated;
GRANT ALL ON public.campaign_instances TO service_role;
ALTER TABLE public.campaign_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY ci_owner ON public.campaign_instances FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND (c.user_id = auth.uid() OR has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND (c.user_id = auth.uid() OR has_role(auth.uid(),'admin'))));

CREATE TABLE public.campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone text NOT NULL,
  name text,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ct_campaign_status ON public.campaign_targets(campaign_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_targets TO authenticated;
GRANT ALL ON public.campaign_targets TO service_role;
ALTER TABLE public.campaign_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY ct_owner ON public.campaign_targets FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'admin'));

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'campaign-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c31ba9e6-9f12-47db-b03f-aa4fc60f320c.lovable.app/api/public/hooks/campaign-tick',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_li6lRNvpgx4fW5a2e3X8kQ_24d9Chpg"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
