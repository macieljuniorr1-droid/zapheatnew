
-- 1) profiles: owner_id + member_role
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS member_role text NOT NULL DEFAULT 'master' CHECK (member_role IN ('master','operator','manager'));

CREATE INDEX IF NOT EXISTS idx_profiles_owner_id ON public.profiles(owner_id);

-- 2) helper: billing owner (master) para um dado usuário
CREATE OR REPLACE FUNCTION public.billing_owner(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT owner_id FROM public.profiles WHERE id = _user_id), _user_id);
$$;

-- 3) helper: é master do usuário-alvo?
CREATE OR REPLACE FUNCTION public.is_team_master(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _viewer = _target
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = _target AND owner_id = _viewer);
$$;

-- 4) atualizar quota: soma a equipe toda sob o master
CREATE OR REPLACE FUNCTION public.user_number_quota(_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH owner AS (SELECT public.billing_owner(_user_id) AS id)
  SELECT 2
    + COALESCE((SELECT free_number_bonus FROM public.subscriptions WHERE user_id = (SELECT id FROM owner)), 0)
    + COALESCE((SELECT COUNT(*)::int FROM public.number_subscriptions
                WHERE user_id = (SELECT id FROM owner) AND status = 'active'), 0);
$$;

-- 5) whatsapp_instances: qual membro opera o número
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_instances_assigned_to ON public.whatsapp_instances(assigned_to);

-- 6) activity_logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id_created ON public.activity_logs(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_logs_select ON public.activity_logs;
CREATE POLICY activity_logs_select ON public.activity_logs FOR SELECT TO authenticated
  USING (public.is_team_master(auth.uid(), user_id) OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS activity_logs_insert ON public.activity_logs;
CREATE POLICY activity_logs_insert ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 7) user_presence
CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_presence TO authenticated;
GRANT ALL ON public.user_presence TO service_role;
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_presence_select ON public.user_presence;
CREATE POLICY user_presence_select ON public.user_presence FOR SELECT TO authenticated
  USING (public.is_team_master(auth.uid(), user_id) OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS user_presence_upsert ON public.user_presence;
CREATE POLICY user_presence_upsert ON public.user_presence FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS user_presence_update ON public.user_presence;
CREATE POLICY user_presence_update ON public.user_presence FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- 8) Ampliar SELECT policies: master vê dados dos funcionários
-- profiles
DROP POLICY IF EXISTS profiles_team_select ON public.profiles;
CREATE POLICY profiles_team_select ON public.profiles FOR SELECT TO authenticated
  USING (public.is_team_master(auth.uid(), id) OR public.has_role(auth.uid(), 'admin'::app_role));

-- whatsapp_instances
DROP POLICY IF EXISTS wa_instances_team_select ON public.whatsapp_instances;
CREATE POLICY wa_instances_team_select ON public.whatsapp_instances FOR SELECT TO authenticated
  USING (public.is_team_master(auth.uid(), user_id) OR public.has_role(auth.uid(), 'admin'::app_role));

-- warmup_logs
DROP POLICY IF EXISTS warmup_logs_team_select ON public.warmup_logs;
CREATE POLICY warmup_logs_team_select ON public.warmup_logs FOR SELECT TO authenticated
  USING (public.is_team_master(auth.uid(), user_id) OR public.has_role(auth.uid(), 'admin'::app_role));

-- campaigns
DROP POLICY IF EXISTS campaigns_team_select ON public.campaigns;
CREATE POLICY campaigns_team_select ON public.campaigns FOR SELECT TO authenticated
  USING (public.is_team_master(auth.uid(), user_id) OR public.has_role(auth.uid(), 'admin'::app_role));

-- campaign_targets (via campaigns)
DROP POLICY IF EXISTS campaign_targets_team_select ON public.campaign_targets;
CREATE POLICY campaign_targets_team_select ON public.campaign_targets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c
                 WHERE c.id = campaign_targets.campaign_id
                   AND (public.is_team_master(auth.uid(), c.user_id) OR public.has_role(auth.uid(), 'admin'::app_role))));

-- message_templates
DROP POLICY IF EXISTS templates_team_select ON public.message_templates;
CREATE POLICY templates_team_select ON public.message_templates FOR SELECT TO authenticated
  USING (public.is_team_master(auth.uid(), user_id) OR public.has_role(auth.uid(), 'admin'::app_role));

-- contact_lists
DROP POLICY IF EXISTS contact_lists_team_select ON public.contact_lists;
CREATE POLICY contact_lists_team_select ON public.contact_lists FOR SELECT TO authenticated
  USING (public.is_team_master(auth.uid(), user_id) OR public.has_role(auth.uid(), 'admin'::app_role));

-- contacts (via list)
DROP POLICY IF EXISTS contacts_team_select ON public.contacts;
CREATE POLICY contacts_team_select ON public.contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contact_lists l
                 WHERE l.id = contacts.list_id
                   AND (public.is_team_master(auth.uid(), l.user_id) OR public.has_role(auth.uid(), 'admin'::app_role))));

-- warmup_groups
DROP POLICY IF EXISTS warmup_groups_team_select ON public.warmup_groups;
CREATE POLICY warmup_groups_team_select ON public.warmup_groups FOR SELECT TO authenticated
  USING (public.is_team_master(auth.uid(), user_id) OR public.has_role(auth.uid(), 'admin'::app_role));
